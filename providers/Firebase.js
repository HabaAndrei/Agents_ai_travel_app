require('dotenv').config();
const { MEASUREMENT_ID, APIKEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID} = process.env;
const {initializeApp} = require("firebase/app");
const {getFirestore} = require("firebase/firestore");


// Singleton
class Firebase {

  static firebaseConfig = {
    apiKey: APIKEY,
    authDomain: AUTH_DOMAIN,
    projectId: PROJECT_ID,
    storageBucket: STORAGE_BUCKET,
    messagingSenderId: MESSAGING_SENDER_ID,
    appId: APP_ID,
    measurementId: MEASUREMENT_ID
  };

  constructor(){

    if (!Firebase.instace){
      Firebase.instace = this;
      const app_firebase = initializeApp(Firebase.firebaseConfig);
      this.db = getFirestore(app_firebase);
      console.log(typeof(this.db), ' << == ');
    }

    return Firebase.instace;

  }

}

module.exports = Firebase