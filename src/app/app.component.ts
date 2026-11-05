import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { Auth, getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, User, GoogleAuthProvider, signInWithPopup, sendPasswordResetEmail, setPersistence, browserLocalPersistence, updateProfile } from 'firebase/auth';

type Page = 'overview' | 'spaces' | 'people' | 'bookings';
type Space = { id: string; name: string; location: string; capacity: number; type: string };
type Person = { id: string; name: string; role: string; email: string; photo?: string };
type Booking = { id: string; spaceName: string; personId: string; title: string; start: string; end: string };
type Store = { spaces: Space[]; people: Person[]; bookings: Booking[] };
const STORAGE_PREFIX='sga-data-v3:';
const initial: Store = { spaces: [], people: [], bookings: [] };

const API_BASE_URL =
  typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? 'http://127.0.0.1:8000'
    : 'https://sga-kpxc.onrender.com';

@Component({ selector:'app-root',standalone:true,imports:[CommonModule,FormsModule],templateUrl:'./app.component.html' })
export class AppComponent implements OnInit {
 view: 'landing'|'login'|'app'='landing'; page: Page='overview'; theme:'dark'|'light'='dark'; mobileMenu=false;
 data: Store=structuredClone(initial); search=''; modal:''|'space'|'person'|'booking'=''; editId=''; message=''; problem='';
 spaceBusy=false;
 spaceForm={name:'',location:'',capacity:12,type:'Reunião'};
 personForm={name:'',role:'',email:'',photo:''};
 bookingForm={spaceName:'',personId:'',title:'',start:'',end:''};
 auth:Auth|null=null; user:User|null=null; authReady=false; authError=''; authBusy=false; loginEmail=''; loginPassword=''; registerName=''; registerBirthDate=''; register=false; private unlisten?:()=>void;

  apiRole = '';

 get canManage():boolean {
  return this.apiRole==='admin' ||
         this.apiRole==='coordinator';
 }


  apiProfileName = '';
  apiStatus = '';

  async loadBackendProfile(user: User): Promise<void> {
    this.apiStatus = 'Consultando perfil...';
    this.apiRole = '';
    this.apiProfileName = '';

    try {
      const token = await user.getIdToken();

      const response = await fetch(
        (API_BASE_URL + '/api/me'),
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const result = await response.json();

      if (this.user?.uid !== user.uid) return;

      if (result.registered && result.profile) {
        this.apiRole = result.profile.role;
        this.apiProfileName = result.profile.full_name;

        const roles: Record<string, string> = {
          coordinator: 'Coordenador',
          admin: 'Administrador',
          user: 'Usuário'
        };

        this.apiStatus = roles[this.apiRole] || 'Usuário';
        this.message = 'Perfil confirmado no Neon: ' + this.apiStatus;
      } else {
        this.apiStatus = 'Perfil não cadastrado no Neon';
        this.problem = this.apiStatus;
      }

    } catch (error) {
      if (this.user?.uid !== user.uid) return;
      console.error('Falha na consulta do perfil:', error);
      this.apiStatus = 'API indisponível ou acesso recusado';
      this.problem = this.apiStatus;
    }
  }

today=new Date();
 get accountName():string { const profile=this.user?.displayName?.trim();return profile || this.user?.email?.split('@')[0] || 'Usuário'; }
 get maxBirthDate():string { const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'); }
 validBirthDate(value:string):boolean { if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;const date=new Date(value+'T12:00:00');return !isNaN(date.getTime())&&date.toISOString().slice(0,10)===value&&date.getFullYear()>=1900&&value<=this.maxBirthDate; }

 async ngOnInit(){try{this.theme=localStorage.getItem('sga-theme')==='light'?'light':'dark';}catch{} await this.configureFirebase();}
 loadUserData(){this.data=structuredClone(initial);if(!this.user)return;try{const raw=localStorage.getItem(STORAGE_PREFIX+this.user.uid);if(raw){const parsed=JSON.parse(raw);if(Array.isArray(parsed.spaces)&&Array.isArray(parsed.people)&&Array.isArray(parsed.bookings))this.data=parsed}}catch{this.data=structuredClone(initial)}}
 get spaces(){return this.data.spaces} get people(){return this.data.people} get bookings(){return [...this.data.bookings].sort((a,b)=>a.start.localeCompare(b.start))}
 get nextBookings(){return this.bookings.filter(b=>b.end>this.localNow()).slice(0,4)}
 get activeCount(){return this.spaces.filter(s=>this.isBusy(s.id)).length}
 get freeCount(){return this.spaces.length-this.activeCount}
 get filteredSpaces(){return this.spaces.filter(s=>`${s.name} ${s.location} ${s.type}`.toLowerCase().includes(this.search.toLowerCase()))}
 get filteredPeople(){return this.people.filter(p=>`${p.name} ${p.role} ${p.email}`.toLowerCase().includes(this.search.toLowerCase()))}
 get filteredBookings(){return this.bookings.filter(b=>`${b.title} ${b.spaceName} ${this.personName(b.personId)}`.toLowerCase().includes(this.search.toLowerCase()))}
 get dateLabel(){return this.today.toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'})}
 localNow(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`}
 async configureFirebase(){try {
  const response=await fetch(new URL('assets/firebase-config.json', document.baseURI).toString(),{cache:'no-store'});
  if(!response.ok)throw new Error('Crie public/assets/firebase-config.json com os dados públicos do seu projeto Firebase.');
  const config=await response.json();
  if(!config.apiKey||!config.authDomain||!config.projectId||!config.appId||String(config.apiKey).includes('COLE_')||String(config.projectId).includes('seu-projeto'))throw new Error('Configuração Firebase incompleta. Edite public/assets/firebase-config.json.');
  const app:FirebaseApp=getApps()[0]||initializeApp(config);
  this.auth=getAuth(app);
  await setPersistence(this.auth,browserLocalPersistence);
  this.unlisten=onAuthStateChanged(this.auth,user=>{this.user=user;this.loadUserData();this.authReady=true;if(user){void this.loadBackendProfile(user);void this.loadEnvironments(user);void this.loadPeople(user);void this.loadBookings(user);}else{this.apiRole='';this.apiProfileName='';this.apiStatus='';}if(user&&this.view==='login')this.view='app';if(!user&&this.view==='app')this.view='login';},()=>{this.authReady=true;this.authError='Não foi possível verificar a sessão.'});
 }catch(e){this.authReady=true;this.authError=e instanceof Error?e.message:'Firebase não configurado.'}}
 async submitLogin(){
  if(!this.auth){this.authError='Configure o Firebase Authentication para fazer login.';return;}
  if(this.authBusy)return;
  if(this.register){
    if(this.registerName.trim().length<2){this.authError='Informe seu nome completo.';return;}
    if(!this.validBirthDate(this.registerBirthDate)){this.authError='Informe uma data de nascimento válida.';return;}
  }
  this.authBusy=true;this.authError='';
  try{
    if(this.register){
      const result=await createUserWithEmailAndPassword(this.auth,this.loginEmail.trim(),this.loginPassword);
      // O nome fica no perfil do Firebase Auth. Não armazenamos data de nascimento no navegador.
      this.user=result.user;
      try {
        await updateProfile(result.user,{displayName:this.registerName.trim()});
      } catch {
        this.authError='Sua conta foi criada, mas não foi possível salvar o nome. Tente atualizar o perfil depois.';
        return;
      }
      // A data será persistida apenas quando houver backend e política de privacidade definidos.
      this.registerName='';this.registerBirthDate='';
    }else{
      const result=await signInWithEmailAndPassword(this.auth,this.loginEmail.trim(),this.loginPassword);
      this.user=result.user;
    }
    this.loadUserData();this.loginPassword='';this.enter();
  }catch(e:any){
    const code=String(e?.code||'');
    this.authError=code.includes('invalid-credential')||code.includes('wrong-password')?'E-mail ou senha incorretos.':code.includes('email-already-in-use')?'Esse e-mail já está cadastrado.':code.includes('weak-password')?'Use uma senha com pelo menos 6 caracteres.':code.includes('invalid-email')?'Digite um e-mail válido.':'Não foi possível autenticar. Verifique os dados e a configuração Firebase.';
  }finally{this.authBusy=false}
 }
 async loginWithGoogle(){
  if(!this.auth){this.authError='Configure o Firebase antes de entrar com o Google.';return;}
  if(this.authBusy)return;
  this.authBusy=true;this.authError='';
  try {
    const provider=new GoogleAuthProvider();
    provider.setCustomParameters({prompt:'select_account'});
    const result=await signInWithPopup(this.auth,provider);
    this.user=result.user;this.loadUserData();this.loginPassword='';
    this.enter();
  } catch(e:any){
    const code=String(e?.code||'');
    this.authError=code.includes('popup-closed-by-user')||code.includes('cancelled-popup-request')
      ? 'Login cancelado. Você pode tentar novamente.'
      : code.includes('popup-blocked')
      ? 'O navegador bloqueou a janela do Google. Autorize pop-ups para este site.'
      : code.includes('unauthorized-domain')
      ? 'Domínio não autorizado. Adicione este domínio em Firebase Authentication → Settings → Authorized domains.'
      : code.includes('account-exists-with-different-credential')
      ? 'Já existe uma conta com esse e-mail. Entre com o método anterior.'
      : 'Não foi possível entrar com o Google. Confira o provedor e os domínios autorizados no Firebase.';
  } finally {this.authBusy=false;}
 }
 async resetPassword(){
  if(!this.auth){this.authError='Configure o Firebase primeiro.';return;}
  if(!this.loginEmail.trim()){this.authError='Digite seu e-mail para receber o link de recuperação.';return;}
  this.authBusy=true;this.authError='';
  try{await sendPasswordResetEmail(this.auth,this.loginEmail.trim());this.authError='Se o e-mail estiver cadastrado, você receberá as instruções de recuperação.';}
  catch(e:any){const code=String(e?.code||'');this.authError=code.includes('invalid-email')?'Informe um e-mail válido.':'Não foi possível enviar a recuperação. Verifique a configuração do Firebase.';}
  finally{this.authBusy=false;}
 }
 async logout(){try{if(this.auth)await signOut(this.auth);this.user=null;this.data=structuredClone(initial);this.view='landing';this.mobileMenu=false;}catch{this.problem='Não foi possível sair. Tente novamente.';}}
 toggleTheme(){this.theme=this.theme==='dark'?'light':'dark';localStorage.setItem('sga-theme',this.theme)}
 enter(){if(!this.user){this.view='login';return;}this.view='app';this.page='overview';this.mobileMenu=false;window.scrollTo(0,0)}
 go(page:Page){this.page=page;this.search='';this.mobileMenu=false;this.problem='';window.scrollTo(0,0)}
 saveStore(){try{localStorage.setItem(STORAGE_PREFIX+(this.user?.uid||'unauthenticated'),JSON.stringify(this.data));this.message='Alterações salvas neste navegador.';this.problem=''}catch{this.problem='Não foi possível salvar os dados. Verifique o espaço do navegador.'}}
 id(){return typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2)}
 initials(name:string){return name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase()}
 spaceName(id:string){return this.spaces.find(s=>s.id===id)?.name||'Ambiente não cadastrado'}
 personName(id:string){return this.people.find(p=>p.id===id)?.name||'Pessoa removida'}
 isBusy(id:string){const n=this.localNow();return this.bookings.some(b=>b.spaceName.trim().toLowerCase()===this.spaceName(id).trim().toLowerCase()&&b.start<=n&&b.end>n)}
 dateTime(v:string){return v?new Date(v).toLocaleString('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}):''}

 async loadEnvironments(user: User): Promise<void> {
  try {
   const token = await user.getIdToken();

   const response = await fetch(
    (API_BASE_URL + '/api/environments'),
    {
     headers: {
      Authorization: `Bearer ${token}`
     }
    }
   );

   if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
   }

   const ambientes = await response.json();

   if (!Array.isArray(ambientes)) {
    throw new Error('Resposta inválida da API');
   }

   if (this.user?.uid !== user.uid) return;

   this.data.spaces = ambientes.map((a: any) => ({
    id: String(a.id),
    name: a.name,
    location: a.location || '',
    capacity: a.capacity || 1,
    type: 'Reunião'
   }));

   console.log(
    'SGA: ambientes carregados do Neon:',
    this.data.spaces.length
   );

  } catch (error) {
   if (this.user?.uid !== user.uid) return;
   console.error('SGA: erro ao carregar ambientes:', error);
   this.problem = 'Não foi possível carregar os ambientes do Neon.';
  }
 }


 private async sendEnvironment(
  method: 'POST'|'PUT'|'DELETE',
  id?: string,
  payload?: {name:string;location:string;capacity:number}
 ): Promise<any> {
  if (!this.user) throw new Error('Faça login novamente.');

  const token = await this.user.getIdToken();
  const url = (API_BASE_URL + '/api/environments')
    + (id ? '/' + encodeURIComponent(id) : '');

  const response = await fetch(url, {
   method,
   headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
   },
   ...(payload ? {body: JSON.stringify(payload)} : {})
  });

  if (!response.ok) {
   const error = await response.json().catch(() => null);
   const detail = error?.detail;
   throw new Error(
    typeof detail === 'string'
      ? detail
      : `Erro HTTP ${response.status}`
   );
  }

  return response.status === 204 ? null : response.json();
 }

 openSpace(space?:Space){this.editId=space?.id||'';this.spaceForm=space?{name:space.name,location:space.location,capacity:space.capacity,type:space.type}:{name:'',location:'',capacity:12,type:'Reunião'};this.modal='space';this.problem=''}

 peopleBusy=false;

 private async sendPerson(
  method: 'POST'|'PUT'|'DELETE',
  id?: string,
  payload?: {name:string;role:string;email:string}
 ): Promise<any> {
  if(!this.user)throw new Error('Faça login novamente.');

  const token=await this.user.getIdToken();
  const url=(API_BASE_URL + '/api/people')
    +(id?'/'+encodeURIComponent(id):'');

  const response=await fetch(url,{
   method,
   headers:{
    Authorization:`Bearer ${token}`,
    'Content-Type':'application/json'
   },
   ...(payload?{body:JSON.stringify(payload)}:{})
  });

  if(!response.ok){
   const error=await response.json().catch(()=>null);
   throw new Error(
    typeof error?.detail==='string'
     ?error.detail
     :`Erro HTTP ${response.status}`
   );
  }

  return response.status===204?null:response.json();
 }

 async loadPeople(user:User):Promise<void>{
  try{
   const token=await user.getIdToken();

   const response=await fetch(
    (API_BASE_URL + '/api/people'),
    {headers:{Authorization:`Bearer ${token}`}}
   );

   if(!response.ok)throw new Error(`HTTP ${response.status}`);

   const pessoas=await response.json();

   if(!Array.isArray(pessoas)){
    throw new Error('Resposta inválida da API de Pessoas');
   }

   if(this.user?.uid!==user.uid)return;

   this.data.people=pessoas.map((p:any)=>({
    id:String(p.id),
    name:p.full_name,
    role:p.role_description,
    email:p.email,
    photo:p.photo_url||''
   }));

   console.log(
    'SGA: pessoas carregadas do Neon:',
    this.data.people.length
   );

  }catch(error){
   if(this.user?.uid!==user.uid)return;
   this.data.people=[];
   console.error('Erro ao carregar Pessoas:',error);
   this.problem='Não foi possível carregar Pessoas do Neon.';
  }
 }

 openPerson(person?:Person){this.editId=person?.id||'';this.personForm=person?{name:person.name,role:person.role,email:person.email,photo:person.photo||''}:{name:'',role:'',email:'',photo:''};this.modal='person';this.problem=''}

 bookingsBusy=false;

 private localDateTime(value:string):string{
  const d=new Date(value);

  if(Number.isNaN(d.getTime()))return '';

  const pad=(n:number)=>String(n).padStart(2,'0');

  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
 }

 async loadBookings(user:User):Promise<void>{
  try{
   const token=await user.getIdToken();

   const response=await fetch(
    (API_BASE_URL + '/api/reservations'),
    {
     headers:{
      Authorization:`Bearer ${token}`
     }
    }
   );

   if(!response.ok){
    throw new Error(`HTTP ${response.status}`);
   }

   const reservas=await response.json();

   if(!Array.isArray(reservas)){
    throw new Error('Resposta inválida da API');
   }

   if(this.user?.uid!==user.uid)return;

   this.data.bookings=reservas.map((r:any)=>({
    id:String(r.id),
    spaceName:r.environment_name,
    personId:String(r.person_id),
    title:r.title,
    start:this.localDateTime(r.starts_at),
    end:this.localDateTime(r.ends_at)
   }));

   console.log(
    'SGA: reservas carregadas do Neon:',
    this.data.bookings.length
   );

  }catch(error){
   if(this.user?.uid!==user.uid)return;

   this.data.bookings=[];
   console.error('Erro ao carregar reservas:',error);
   this.problem='Não foi possível carregar as reservas do Neon.';
  }
 }

 private async sendBooking(
  method:'POST'|'DELETE',
  id?:string,
  payload?:{
   environment_id:number;
   person_id:number;
   title:string;
   starts_at:string;
   ends_at:string;
  }
 ):Promise<void>{
  if(!this.user)throw new Error('Faça login novamente.');

  const token=await this.user.getIdToken();

  const url=(API_BASE_URL + '/api/reservations')
   +(id?'/'+encodeURIComponent(id):'');

  const response=await fetch(url,{
   method,
   headers:{
    Authorization:`Bearer ${token}`,
    'Content-Type':'application/json'
   },
   ...(payload?{body:JSON.stringify(payload)}:{})
  });

  if(!response.ok){
   const error=await response.json().catch(()=>null);
   throw new Error(
    typeof error?.detail==='string'
     ?error.detail
     :`Erro HTTP ${response.status}`
   );
  }
 }

 openBooking(space?:Space){this.editId='';this.bookingForm={spaceName:space?.name||'',personId:'',title:'',start:'',end:''};this.modal='booking';this.problem=''}
 closeModal(){this.modal='';this.problem=''}
 selectPhoto(e:Event){const file=(e.target as HTMLInputElement).files?.[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)){this.problem='Escolha uma imagem JPG, PNG ou WebP.';return}if(file.size>2*1024*1024){this.problem='A foto deve ter no máximo 2 MB.';return}const reader=new FileReader();reader.onload=()=>{this.personForm.photo=String(reader.result||'');this.problem=''};reader.readAsDataURL(file)}
 async submit(){this.problem='';if(this.modal==='space'){
  if(this.spaceBusy)return;

  const x=this.spaceForm;
  if(!x.name.trim()||!x.location.trim()||
     !Number.isFinite(+x.capacity)||+x.capacity<1){
   this.problem='Preencha nome, localização e capacidade.';
   return;
  }

  this.spaceBusy=true;

  try {
   const editing=Boolean(this.editId);
   const result=await this.sendEnvironment(
    editing?'PUT':'POST',
    editing?this.editId:undefined,
    {
     name:x.name.trim(),
     location:x.location.trim(),
     capacity:+x.capacity
    }
   );

   const ambiente:Space={
    id:String(result.id),
    name:result.name,
    location:result.location||'',
    capacity:result.capacity||1,
    type:x.type
   };

   if(editing){
    this.data.spaces=this.spaces.map(s=>
     s.id===ambiente.id?ambiente:s
    );
   }else{
    this.data.spaces=[...this.spaces,ambiente];
   }

   this.closeModal();
   this.message=editing
    ?'Ambiente atualizado no Neon.'
    :'Ambiente cadastrado no Neon.';
  }catch(error){
   this.problem=error instanceof Error
    ?error.message
    :'Erro ao salvar ambiente.';
  }finally{
   this.spaceBusy=false;
  }
 }else if(this.modal==='person'){
  if(this.peopleBusy)return;

  const x=this.personForm;

  if(!x.name.trim()||!x.role.trim()||!x.email.includes('@')){
   this.problem='Informe nome, função e um e-mail válido.';
   return;
  }

  if(x.photo){
   this.problem='O armazenamento de fotos ainda não está disponível no Neon. Remova a foto para salvar.';
   return;
  }

  this.peopleBusy=true;

  try{
   const editing=Boolean(this.editId);

   const result=await this.sendPerson(
    editing?'PUT':'POST',
    editing?this.editId:undefined,
    {
     name:x.name.trim(),
     role:x.role.trim(),
     email:x.email.trim()
    }
   );

   const pessoa:Person={
    id:String(result.id),
    name:result.full_name,
    role:result.role_description,
    email:result.email,
    photo:result.photo_url||''
   };

   if(editing){
    this.data.people=this.people.map(p=>
     p.id===pessoa.id?pessoa:p
    );
   }else{
    this.data.people=[...this.people,pessoa];
   }

   this.closeModal();
   this.message=editing
    ?'Pessoa atualizada no Neon.'
    :'Pessoa cadastrada no Neon.';

  }catch(error){
   this.problem=error instanceof Error
    ?error.message
    :'Erro ao salvar pessoa.';
  }finally{
   this.peopleBusy=false;
  }

  return;
 }else if(this.modal==='booking'){
  if(this.bookingsBusy)return;

  const x=this.bookingForm;

  if(!x.spaceName.trim()||!x.personId||
     !x.title.trim()||!x.start||!x.end){
   this.problem='Preencha todos os dados da reserva.';
   return;
  }

  const inicio=new Date(x.start);
  const fim=new Date(x.end);

  if(
   Number.isNaN(inicio.getTime())||
   Number.isNaN(fim.getTime())||
   inicio>=fim
  ){
   this.problem='Informe um período válido.';
   return;
  }

  const matches=this.spaces.filter(s=>
   s.name.trim().toLowerCase()===
   x.spaceName.trim().toLowerCase()
  );

  if(matches.length!==1){
   this.problem=matches.length===0
    ?'Selecione um ambiente cadastrado.'
    :'Existem ambientes com o mesmo nome. Use um nome único.';
   return;
  }

  const ambiente=matches[0];

  const pessoa=this.people.find(p=>p.id===x.personId);

  if(!pessoa){
   this.problem='Selecione uma pessoa cadastrada.';
   return;
  }

  this.bookingsBusy=true;

  try{
   await this.sendBooking('POST',undefined,{
    environment_id:Number(ambiente.id),
    person_id:Number(pessoa.id),
    title:x.title.trim(),
    starts_at:inicio.toISOString(),
    ends_at:fim.toISOString()
   });

   await this.loadBookings(this.user!);

   this.closeModal();
   this.problem='';
   this.message='Reserva cadastrada no Neon.';

  }catch(error){
   this.problem=error instanceof Error
    ?error.message
    :'Erro ao salvar reserva.';
  }finally{
   this.bookingsBusy=false;
  }

  return;
 }else return;
 this.saveStore();if(!this.problem)this.closeModal();
 }
 async removeSpace(s:Space){
  if(this.spaceBusy)return;

  if(this.bookings.some(b=>
   b.spaceName.trim().toLowerCase()===s.name.trim().toLowerCase()
  )){
   this.problem='Exclua as reservas deste ambiente antes de removê-lo.';
   return;
  }

  if(!confirm(`Excluir ${s.name}?`))return;

  this.spaceBusy=true;
  this.problem='';

  try{
   await this.sendEnvironment('DELETE',s.id);
   this.data.spaces=this.spaces.filter(x=>x.id!==s.id);
   this.message='Ambiente excluído do Neon.';
  }catch(error){
   this.problem=error instanceof Error
    ?error.message
    :'Não foi possível excluir o ambiente.';
  }finally{
   this.spaceBusy=false;
  }
 }
 async removePerson(p:Person){
  if(this.peopleBusy)return;

  if(this.bookings.some(b=>b.personId===p.id)){
   this.problem='Exclua as reservas desta pessoa antes de removê-la.';
   return;
  }

  if(!confirm(`Excluir ${p.name}?`))return;

  this.peopleBusy=true;
  this.problem='';

  try{
   await this.sendPerson('DELETE',p.id);
   this.data.people=this.people.filter(x=>x.id!==p.id);
   this.message='Pessoa excluída do Neon.';
  }catch(error){
   this.problem=error instanceof Error
    ?error.message
    :'Erro ao excluir pessoa.';
  }finally{
   this.peopleBusy=false;
  }
 }
 async removeBooking(b:Booking){
  if(this.bookingsBusy)return;

  if(!confirm(`Cancelar reserva: ${b.title}?`))return;

  this.bookingsBusy=true;
  this.problem='';

  try{
   await this.sendBooking('DELETE',b.id);

   this.data.bookings=this.data.bookings.filter(
    x=>x.id!==b.id
   );

   this.message='Reserva cancelada no Neon.';

  }catch(error){
   this.problem=error instanceof Error
    ?error.message
    :'Erro ao cancelar reserva.';
  }finally{
   this.bookingsBusy=false;
  }
 }
}
