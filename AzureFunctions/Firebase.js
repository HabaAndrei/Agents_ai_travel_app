require('dotenv').config();
const { MEASUREMENT_ID, APIKEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID} = process.env;
const {initializeApp} = require("firebase/app");
const {getFirestore} = require("firebase/firestore");

const firebaseConfig = {
  apiKey: APIKEY,
  authDomain: AUTH_DOMAIN,
  projectId: PROJECT_ID,
  storageBucket: STORAGE_BUCKET,
  messagingSenderId: MESSAGING_SENDER_ID,
  appId: APP_ID,
  measurementId: MEASUREMENT_ID
};
const app_firebase = initializeApp(firebaseConfig);
const db = getFirestore(app_firebase);


class Firebase {
  constructor(){
    this.db = db;
  }
}

module.exports = Firebase