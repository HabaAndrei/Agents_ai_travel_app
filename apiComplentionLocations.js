require('dotenv').config();
const  OpenAI = require('openai');
const {API_KEY_OPENAI, API_KEY_GOOGLE_MAP, MEASUREMENT_ID, APIKEY, AUTH_DOMAIN, PROJECT_ID, STORAGE_BUCKET, MESSAGING_SENDER_ID, APP_ID} = process.env;
const openai = new OpenAI({ apiKey: API_KEY_OPENAI });
const apiKeyGoogleMaps = API_KEY_GOOGLE_MAP;
const axios = require('axios');
const {initializeApp} = require("firebase/app");
const {getFirestore, setDoc, getDoc, doc} = require("firebase/firestore");

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

class ApiComplentionLocations {

  constructor(objectWithVariables){
    const {city, country, input, checkbox, isLocalPlaces, scaleVisit} = objectWithVariables;
    this.city = city;
    this.country = country;
    this.input = input;
    this.checkbox = checkbox;
    this.isLocalPlaces = isLocalPlaces;
    this.scaleVisit = scaleVisit;
    this.countVerifyLocations = 0
  }

  async LlmCallWithJsonResponse(systemPrompt, userPrompt){
    try {
      const completion = await openai.chat.completions.create({
        messages: [{
          role: 'system', content:  systemPrompt
        },
        {
          'role': 'user',
          'content': userPrompt
        }],
        model: 'gpt-4o-mini',
        response_format: { "type": "json_object" },
        temperature: 0,
      });

      let result = completion.choices[0]?.message?.content;
      if(typeof result === 'string')result = JSON.parse(result);
      return {isResolved: true, data: result};
    }catch(err){
      console.log({err});
      return {isResolved: false, err};
    }
  }

  returnUniqueValesFromArray(array){
    let newAr = [];
    array.forEach((elem, index)=>{if(!newAr.includes(elem))newAr.push(index)});
    return newAr;
  }

  async returnImgLink(reference){
    let rezFin = {isResolved: true, url: ''};
    try{
      const data = await axios.get(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=3000&photoreference=`+  reference +`&key=` + apiKeyGoogleMaps)
      const url = data.request.res.responseUrl;
      rezFin = {isResolved:true, url};
    }catch(err){
      rezFin = {isResolved:false, err: err?.message};
    }
    return rezFin;
  }

  async dataFromGoogle(place, indexPlace){

    let rezFin = {isResolved: true, data: '', index: indexPlace}
    try{
      const locationName = place.replace(' ', '%20')
      const input = [locationName, 'City:', this.city, 'Country:', this.country].join('%20');
      const addressAndIdPlace = await axios.post('https://maps.googleapis.com/maps/api/place/findplacefromtext/json?fields=formatted_address%2Cplace_id&input=' + input + '&inputtype=textquery&key=' + apiKeyGoogleMaps);
      if(!addressAndIdPlace?.data?.candidates?.[0]){
        rezFin = {isResolved: false, err: 'value: addressAndIdPlace?.data?.candidates?.[0] from function dataFromGoogle is undefined'}
        return rezFin;
      }
      const {formatted_address, place_id} = addressAndIdPlace?.data?.candidates?.[0];
      const address = formatted_address;

      if(place_id){
        const docRef = doc(db, "places", place_id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          rezFin = {isResolved: true, data, index: indexPlace}
          return rezFin;
        }
      }

      const detailsPlace = await axios.post('https://maps.googleapis.com/maps/api/place/details/json?language=en%2Cfields=geometry%2Cname%2Copening_hours%2Cphotos%2Cwebsite%2Curl&place_id=' + place_id +'&key=' + apiKeyGoogleMaps);

      const {url, website, name} = detailsPlace?.data?.result;
      const urlLocation = url;
      const geometry_location = detailsPlace?.data?.result?.geometry?.location;
      const arrayProgramPlace = detailsPlace?.data?.result?.opening_hours?.weekday_text;
      const referincesPhotosArray = detailsPlace?.data?.result?.photos?.map((ob)=>ob.photo_reference);

      let arrayWithLinkImages = [];
      const arrayWithPromisesImages = referincesPhotosArray.map((ref)=>{
        return this.returnImgLink(ref);
      })
      const arrayWithResponsePromisesImages = await Promise.all(arrayWithPromisesImages);
      for(let rez of arrayWithResponsePromisesImages){
        if(!rez.isResolved)continue;
        else arrayWithLinkImages.push(rez.url)
      }

      const obData = {
        location: name,
        address : address ? address : '',
        place_id: place_id ? place_id : '',
        urlLocation: urlLocation ? urlLocation : '',
        geometry_location: geometry_location ? geometry_location : '',
        website: website ? website : '',
        arrayProgramPlace: arrayProgramPlace ? arrayProgramPlace : [],
        arrayWithLinkImages: arrayWithLinkImages ? arrayWithLinkImages : []
      }

      if(place_id)setDoc(doc(db, "places", place_id), obData);

      rezFin = {isResolved: true, data: obData, index: indexPlace}
    }catch(err){
      console.log('we have error at datafromgoogle, ', err);
      rezFin  = {isResolved:false, err: err?.message};
    }
    return rezFin;
  }

  async timeToLocation(place, index){
    try{
      const textPromptSystem = `
        \n Task: You are an expert providing an estimation of the time required to visit a location and the available packages for visiting that location.
        \n Important:
          1. If the location is not known, return this in JSON format: {response: {}}.
          2. The packages should contain information only about that specific location, without including data from other locations, even if they are nearby, or in the same building.
          (example: In Burj Khalifa, Dubai, I want the packages to include only Burj Khalifa activities, not the Dubai Mall or the fountain spectacle." )
          3. The packages should complement each other, as in this example: << Garden visit, Lake visit, Lake plus Garden visit >>
        \n Response: The response should be in JSON format:
        {
          "response": {
            "average_hours_visiting_full_location": 4,
            "packages": {
            // Include this property only if you can find available packages for the location. If no packages are available, do not include this property.
            "1": {
              "name": "Garden tour",
              "average_visiting_hours": 1,
              "selected": false,
            },
            "2": {
              "name": "Lake tour",
              "average_visiting_hours": 1,
              "selected": false,
            },
            "3": {
              "name": "Garden tour with lake",
              "average_visiting_hours": 2,
              "selected": false,
            },
            // Add additional packages as needed.
            }
          }
        }
      `;
      const textPromptUser = `Place: ${place} from ${this.city}, ${this.country}`;

      const resultTimeToLocationLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultTimeToLocationLlm.isResolved){
        return this.timeToLocation(place, index);
      }
      let resultTour = resultTimeToLocationLlm?.data?.response;
      return {isResolved: true, data: resultTour, index};
    }catch(err){
        return {isResolved: false, err};
    }
  }

  async verifyLocations(locations, prompt){
    if (typeof locations != 'string') locations = JSON.stringify(locations);
    try {
      this.countVerifyLocations+=1;
      const textPromptUser =  prompt + 'Locations: ' + locations;
      const textPromptSystem = `
      \n Task: Your task is to verify if all places belong to a specific location.
        If even one place is not from that location, the verification should return false, as shown in the example below.
      \n Response: the response should be in json format:
        {isRespectingTheRules: true / false}
      `;
      const resultVerifyLocations = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultVerifyLocations.isResolved){
        return this.verifyLocations(locations, prompt);
      }
      let result = resultVerifyLocations.data;
      return {isResolved: true, data: result?.isRespectingTheRules};
    }catch(err){
      return {isResolved: false};
    }
  }


  async getAllPlacesAboutLocations(){
    try{
      let textPromptUser = 'Location: ' + this.city + '  from  ' + this.country;
      let categories =  'This is the list of [Activities]: ' +  `${this?.checkbox?.length ? this.checkbox?.join(', ') : ''}`
      +  `${this?.checkbox?.length ? ', ' : ' '}` + `${this?.input ? this?.input : ''}`;

      let numberOfPlacesPrompt = this?.scaleVisit == '1'  ? '' :
      this?.scaleVisit == '2' ? `Generate at least 6 locations to visit.` : this?.scaleVisit == '3' ? `Generate at least 15 locations to visit.`  : '';

      let requirememtPrompt = this.isLocalPlaces === 'true' ? `
        \n Requirement:  The input should be a request for lesser-known locations. Provide recommendations for places frequented by locals, rather than popular tourist spots.
        You can get inspiration from local sites or blogs that recommend something like this.
      ` : '';

      let textPromptSystem = `
        \n Task: Your goal is to return a list of places to visit based on a given location and a list of [Activities].
        The locations must not be repeated.  ${numberOfPlacesPrompt}
        \n Attention: Ensure the locations provided match the given category of interest: ${categories}. ${requirememtPrompt}
        \n Note: The response should be formatted in JSON, as follows:
        {
          "unique_places": [
            {
              "name": "The Global Village", // the name in english
              "alias": "The Global Village" // the name in the country's languge
            },
            {
              "name": "The Dubai Fountain", // the name in english
              "alias" : "The Dubai Fountain" //  // the name in the country's languge
            },
          ]
        }
      `;

      const resultLocationsLlm = await this.LlmCallWithJsonResponse(textPromptSystem, textPromptUser);
      if(!resultLocationsLlm.isResolved){
        return this.getAllPlacesAboutLocations();
      }
      let resultLocations = resultLocationsLlm.data;

      const resultVerification = await this.verifyLocations(resultLocations, textPromptUser);
      if(resultVerification?.isResolved && !resultVerification?.data && this.countVerifyLocations < 3){
        console.log('is executing again: ', this.countVerifyLocations);
        return this.getAllPlacesAboutLocations();
      }

      const {unique_places} = resultLocations;
      const unique_names = unique_places.map((ob)=>ob.name);
      const arIndexOfUniquePlaces = this.returnUniqueValesFromArray(unique_names);
      const arWithNameAlias = arIndexOfUniquePlaces.map((index)=>unique_places[index])

      const arrayWithCalls = arWithNameAlias.map((objectNameAlias, index)=>{
        const {alias} = objectNameAlias;
        return this.dataFromGoogle(alias, index);
      })

      const dataFromGoogleCalls = await Promise.all(arrayWithCalls);

      const arrayCallsTimeLocations = arWithNameAlias.map((objectNameAlias, index)=>{
        const {alias} = objectNameAlias;
        return this.timeToLocation(alias, index);
      });

      const dataFromTimeLocations = await Promise.all(arrayCallsTimeLocations);

      const findTimeLocation = (index) => {
        const ob = dataFromTimeLocations.find((ob)=>ob.index === index);
        return !ob?.isResolved ? {} : {...ob?.data};
      };

      let arrayWithAllData = [];
      for(let ob of dataFromGoogleCalls){

        if(!ob.isResolved)continue;
        const {location, place_id, arrayProgramPlace, arrayWithLinkImages, address,
          urlLocation, website, geometry_location} = ob.data;
        const index_ = ob.index;
        const dataTimeLocation = findTimeLocation(index_);
        arrayWithAllData.push(
          {
            name: location,
            address : address ? address : '',
            place_id : place_id ? place_id : '',
            urlLocation: urlLocation ? urlLocation : '',
            geometry_location: geometry_location ? geometry_location : '',
            website: website ? website : '',
            arrayProgramPlace: arrayProgramPlace ? arrayProgramPlace : [],
            arrayWithLinkImages: arrayWithLinkImages ? arrayWithLinkImages : [],
            index: index_,
            dataTimeLocation: dataTimeLocation ? dataTimeLocation : {},
          }
        )
      }
      this.rezFinal = {isResolved: true, data: arrayWithAllData};
      return this.rezFinal;
    }catch(err){
      console.log('error at getAllPlacesAboutLocations', err)
      this.rezFinal = {isResolved: false, err: err?.message};
      return this.rezFinal
    }
  }

}

module.exports = { ApiComplentionLocations }
