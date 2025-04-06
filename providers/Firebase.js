const EnvConfig = require('./EnvConfig.js');
const admin = require("firebase-admin");

const envVariable = EnvConfig.getInstance();

// Singleton
class Firebase {

  static firebaseConfig = {
    type: envVariable.get('GOOGLE_SERVICE_ACCOUNT_TYPE'),
    project_id: envVariable.get('GOOGLE_SERVICE_ACCOUNT_PROJECT_ID'),
    private_key_id: envVariable.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY_ID'),
    private_key: envVariable.get('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
    client_email: envVariable.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_EMAIL'),
    client_id: envVariable.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_ID'),
    auth_uri: envVariable.get('GOOGLE_SERVICE_ACCOUNT_AUTH_URI'),
    token_uri: envVariable.get('GOOGLE_SERVICE_ACCOUNT_TOKEN_URI'),
    auth_provider_x509_cert_url: envVariable.get('GOOGLE_SERVICE_ACCOUNT_AUTH_PROVIDER_X509_CERT_URL'),
    client_x509_cert_url: envVariable.get('GOOGLE_SERVICE_ACCOUNT_CLIENT_X509_CERT_URL'),
    universe_domain: envVariable.get('GOOGLE_SERVICE_ACCOUNT_UNIVERSE_DOMAIN'),
  };

  constructor(){

    if (!Firebase.instace){
      Firebase.instace = this;
      const app_firebase = admin.initializeApp({
        credential: admin.credential.cert(Firebase.firebaseConfig)
      });
      this.db = app_firebase.firestore();
    }

    return Firebase.instace;

  }

  async verifyIdToken(user_token){
    try {
      let rez = await admin.auth().verifyIdToken(user_token);
      if (!rez.uid) {
        return {isResolved: false};
      }
      return {isResolved: true};
    }catch(err){
      return {isResolved: false};
    }
  }

}

module.exports = Firebase