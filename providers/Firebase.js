const {initializeApp} = require("firebase/app");
const {getFirestore} = require("firebase/firestore");
const EnvConfig = require('./EnvConfig.js');

const envVariable = EnvConfig.getInstance();

// Singleton
class Firebase {

  static firebaseConfig = {
    apiKey: envVariable.get('APIKEY'),
    authDomain: envVariable.get('AUTH_DOMAIN'),
    projectId: envVariable.get('PROJECT_ID'),
    storageBucket: envVariable.get('STORAGE_BUCKET'),
    messagingSenderId: envVariable.get('MESSAGING_SENDER_ID'),
    appId: envVariable.get('APP_ID'),
    measurementId: envVariable.get('MEASUREMENT_ID')
  };

  constructor(){

    if (!Firebase.instace){
      Firebase.instace = this;
      const app_firebase = initializeApp(Firebase.firebaseConfig);
      this.db = getFirestore(app_firebase);
    }

    return Firebase.instace;

  }

}

module.exports = Firebase