/* Run only inside the private Mongo initialization container. */
const admin=new Mongo('mongodb://nexvia_root:'+process.env.MONGO_ROOT_PASSWORD+'@mongo:27017/admin?directConnection=true').getDB('admin');
try{admin.runCommand({replSetGetStatus:1});const status=admin.runCommand({replSetGetStatus:1});if(status.ok!==1)throw new Error('not initialized');}catch{admin.runCommand({replSetInitiate:{_id:'nexvia',members:[{_id:0,host:'mongo:27017'}]}});}
let ready=false;for(let i=0;i<60;i++){if(admin.runCommand({hello:1}).isWritablePrimary){ready=true;break;}sleep(1000);}if(!ready)throw new Error('Replica set did not become primary.');
for(const name of ['identity','profile','opportunity','matching','community','notification','cv']){const owned=admin.getSiblingDB('nexvia_'+name);if(!owned.getUser('nexvia_'+name))owned.createUser({user:'nexvia_'+name,pwd:process.env[name.toUpperCase()+'_DB_PASSWORD'],roles:[{role:'readWrite',db:'nexvia_'+name}]});}
print('Replica set and restricted domain database users are ready.');
