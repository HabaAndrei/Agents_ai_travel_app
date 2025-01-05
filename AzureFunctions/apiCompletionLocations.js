require('dotenv').config();
const { API_KEY_GOOGLE_MAP} = process.env;
const apiKeyGoogleMaps = API_KEY_GOOGLE_MAP;
const axios = require('axios');
const {setDoc, getDoc, doc} = require("firebase/firestore");
const  z = require("zod");
const OpenaiClient = require('./OpenaiClient');
const Firebase = require('./Firebase');

class ApiCompletionLocations extends OpenaiClient {

  constructor(objectWithVariables){
    super();
    const {city, country, input, checkbox, isLocalPlaces, scaleVisit} = objectWithVariables;
    this.city = city;
    this.country = country;
    this.input = input;
    this.checkbox = checkbox;
    this.isLocalPlaces = isLocalPlaces;
    this.scaleVisit = scaleVisit;
    this.countVerifyLocations = 0;
    this.rejectionReasonForProximityVerification = '';
    this.firebaseInstance = new Firebase();
  }

  // Return an array without duplicate values, verifying only the 'name' and 'alias' properties.
  returnUniqueValesFromArray(array){
    let newAr = [];
    array.forEach((data)=>{
      const {name, alias} = data;
      const find = newAr.find((d)=>d?.name === name || d?.alias === alias);
      if (!find) newAr.push(data);
    })
    return newAr;
  }

  // this function returns link image for a specific reference, i do this with google api
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

  // This function retrieves location details from the Google Maps API
  async locationDetailsFromGoogleApi(place, description, indexPlace){
    const db = this.firebaseInstance.db;
    try{
      // create the url based on the api specification
      const locationName = place.replace(' ', '%20')
      const input = [locationName, 'City:', this.city, 'Country:', this.country, description].join('%20');
      const addressAndIdPlace = await axios.post('https://maps.googleapis.com/maps/api/place/findplacefromtext/json?fields=formatted_address%2Cplace_id&input=' + input + '&inputtype=textquery&key=' + apiKeyGoogleMaps);
      // verify to exist the location and get the place id
      if(!addressAndIdPlace?.data?.candidates?.[0]){
        console.log(`Place: ${place} => value: addressAndIdPlace?.data?.candidates?.[0] from function locationDetailsFromGoogleApi is undefined`);
        return {isResolved: false, err: 'value: addressAndIdPlace?.data?.candidates?.[0] from function locationDetailsFromGoogleApi is undefined'}
      }
      const {formatted_address, place_id} = addressAndIdPlace?.data?.candidates?.[0];
      const address = formatted_address;

      // If the place already exists in the database, I send the data from the database
      if(place_id){
        const docRef = doc(db, "places", place_id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          return {isResolved: true, data, index: indexPlace}
        }
      }

      // get details based on place id
      const detailsPlace = await axios.post('https://maps.googleapis.com/maps/api/place/details/json?language=en%2Cfields=geometry%2Cname%2Copening_hours%2Cphotos%2Cwebsite%2Curl&place_id=' + place_id +'&key=' + apiKeyGoogleMaps);

      const {url, website, name} = detailsPlace?.data?.result;
      const urlLocation = url;
      const geometry_location = detailsPlace?.data?.result?.geometry?.location;
      const arrayProgramPlace = detailsPlace?.data?.result?.opening_hours?.weekday_text;
      const referincesPhotosArray = detailsPlace?.data?.result?.photos?.map((ob)=>ob.photo_reference);

      // get image link for each reference
      let arrayWithLinkImages = [];
      const arrayWithPromisesImages = referincesPhotosArray.map((ref)=>{
        return this.returnImgLink(ref);
      })
      const arrayWithResponsePromisesImages = await Promise.all(arrayWithPromisesImages);
      for(let rez of arrayWithResponsePromisesImages){
        if(!rez.isResolved)continue;
        else arrayWithLinkImages.push(rez.url)
      }

      // create the result object
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

      // save the place in database
      if(place_id)setDoc(doc(db, "places", place_id), obData);

      // send the result
      return {isResolved: true, data: obData, index: indexPlace}
    }catch(err){
      console.log('we have error at datafromgoogle, ', err);
      return {isResolved:false, err: err?.message};
    }
  }

  // this function retrive visit packages for a specific location
  async visitPackages(place, index){
    try{
      // prompts and json schema
      const textPromptSystem = `
        \n Task: You are an expert providing an estimation of the time required to visit a location and the available packages for visiting that location.
        \n Important:
          1. If the location is not known, return this in JSON format: {response: {}}.
          2. The packages should contain information only about that specific location, without including data from other locations, even if they are nearby, or in the same building.
          (example: In Burj Khalifa, Dubai, I want the packages to include only Burj Khalifa activities, not the Dubai Mall or the fountain spectacle." )
          3. The packages should complement each other, as in this example: << 1. Garden visit 2. Lake visit 3. Lake plus Garden visit >>
      `;
      const textPromptUser = `Place: ${place} from ${this.city}, ${this.country}`;

      const Packages = z.object({
        name: z.string().describe('Maxim 5 words'),
        average_visiting_hours: z.number(),
        selected: z.boolean().describe('allways false')
      })

      const JsonSchema = z.object({
        response: z.object({
          average_hours_visiting_full_location: z.number(),
          packages: z.array(Packages).describe('Include this property only if you can find available packages for the location. If no packages are available, do not include this property')
        })
      });

      // Create the request to OpenAI and send the result based on the information received.
      const resultTimeToLocationLlm =  await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultTimeToLocationLlm.isResolved){
        return {isResolved: false, err: resultTimeToLocationLlm?.err};;
      }
      let resultTour = resultTimeToLocationLlm?.data;
      return {isResolved: true, data: resultTour, index};
    }catch(err){
        return {isResolved: false, err};
    }
  }

  // Verify if the locations are within the proximity area
  async verifyProximitylocations(locations, prompt){
    if (typeof locations != 'string') locations = JSON.stringify(locations);
    try {
      // prompts and json schema
      this.countVerifyLocations+=1;
      const textPromptUser =  prompt + 'Locations: ' + locations;
      const textPromptSystem = `
      \n Task: Your task is to verify if all places belong to a specific location. The places can be from the surroundings
        If even one place is not from that location, the verification should return false, as shown in the example below.
      `;
      const JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false'),
          reason: z.string().describe('This should contain a reason only if isRespectingTheRules is false; otherwise, it can be an empty string.')
        })
      })

      // Create the request to OpenAI and send the result based on the information received.
      const resultVerifyLocations = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultVerifyLocations.isResolved){
        return {isResolved: false};
      }
      let result = resultVerifyLocations.data;
      this.rejectionReasonForProximityVerification += result.reason;
      console.log(this.rejectionReasonForProximityVerification, ' <<<<< ========  this.rejectionReasonForProximityVerification');
      return {isResolved: true, data: result?.isRespectingTheRules};
    }catch(err){
      return {isResolved: false};
    }
  }

  // get locations to visit in a city
  async getAllPlacesAboutLocations(){
    try{
      // Based on the selected activities, the option to visit popular places (or not), and the chat, create a flexible prompt with a JSON schema.
      let textPromptUser = 'Location: ' + this.city + '  from  ' + this.country;
      let categories =  'This is the list of [Activities]: ' +  `${this?.checkbox?.length ? this.checkbox?.join(', ') : ''}`
      +  `${this?.checkbox?.length ? ', ' : ' '}` + `${this?.input ? this?.input : ''}`;

      // Show multiple places to generate the LLM.
      let numberOfPlacesPrompt = this?.scaleVisit == '1'  ? '' :
      this?.scaleVisit == '2' ? `Generate at least 6 locations to visit.` : this?.scaleVisit == '3' ? `Generate at least 15 locations to visit.`  : '';

      // local places or not
      let requirememtPrompt = this.isLocalPlaces === 'true' ? `
        \n Requirement:  The input should be a request for lesser-known locations. Provide recommendations for places frequented by locals, rather than popular tourist spots.
        You can get inspiration from local sites or blogs that recommend something like this.
      ` : '';

      let textPromptSystem = `
        \n Task: Your goal is to return a list of places to visit based on a given location and a list of [Activities].
          The locations must not be repeated.  ${numberOfPlacesPrompt}
        \n Attention: Ensure the locations provided match the given category of interest: ${categories}. ${requirememtPrompt}
        \n Verification: Ensure that every activity has at least one associated location.
      `;

      // If the function was rejected, use that argument to create the best prompt.
      if (this.rejectionReasonForProximityVerification.length) {
        textPromptSystem += `\n Notice: This is the reason why the result wasn t go last time: ${this.rejectionReasonForProximityVerification}.
        \n <<<<<  Don t repet the same mistakes >>>>> `
      }
      // json schema
      const UniquePlacesSchema = z.object({
      	name: z.string().describe(`The name in english. The name should be relevant. For example, if you are in Brașov, Romania, and choose Poiana Brașov, don’t just say 'Poiana'; say 'Poiana Brașov,' the full name.`),
        alias: z.string().describe("The name in the country's languge"),
        description: z.string().describe('Only one word description e.g: road, mountain, lake, church, museum, restaurant, shop')
      })
      const JsonSchema = z.object({
      	response: z.object({
      		unique_places: z.array(UniquePlacesSchema)
      	})
      });

      // create locations
      const resultLocationsLlm = await this.retryLlmCallWithSchema(textPromptSystem, textPromptUser, JsonSchema);
      if(!resultLocationsLlm.isResolved){
        return {isResolved: false, err: resultLocationsLlm?.err };
      }
      let resultLocations = resultLocationsLlm.data;

      // verify proximity of locations
      const resultVerification = await this.verifyProximitylocations(resultLocations, textPromptUser);

      // Execute a maximum of 3 times if the LLM does not provide a location to be included in the acceptance criteria
      if(resultVerification?.isResolved && !resultVerification?.data && this.countVerifyLocations < 3){
        console.log('is executing again: ', this.countVerifyLocations);
        return this.getAllPlacesAboutLocations();
      }
      const {unique_places} = resultLocations;

      // filter only unique places based on 'name' and 'alias'
      const arWithNameAliasDescription = this.returnUniqueValesFromArray(unique_places);

      // get details for each location
      const arrayWithCalls = arWithNameAliasDescription.map((objectNameAlias, index)=>{
        const {alias, description} = objectNameAlias;
        return this.locationDetailsFromGoogleApi(alias, description, index);
      })
      const dataFromGoogleCalls = await Promise.all(arrayWithCalls);

      // get visit packages for each location
      const arrayCallsVisitPackages = arWithNameAliasDescription.map((objectNameAlias, index)=>{
        const {alias} = objectNameAlias;
        return this.visitPackages(alias, index);
      });
      const dataFromVisitPackages = await Promise.all(arrayCallsVisitPackages);

      // associate packages with locations
      const findVisitPackagesLocation = (index) => {
        const ob = dataFromVisitPackages.find((ob)=>ob.index === index);
        return !ob?.isResolved ? {} : {...ob?.data};
      };

      // associate details from google api with locations and create the response
      let arrayWithAllData = [];
      for(let details of dataFromGoogleCalls){
        if(!details.isResolved)continue;
        const {location, place_id, arrayProgramPlace, arrayWithLinkImages, address,
          urlLocation, website, geometry_location} = details.data;
        const index_ = details.index;
        const dataTimeLocation = findVisitPackagesLocation(index_);
        const name = arWithNameAliasDescription?.[index_]?.name;
        arrayWithAllData.push(
          {
            name: name || '',
            address : address || '',
            place_id : place_id || '',
            urlLocation: urlLocation || '',
            geometry_location: geometry_location || '',
            website: website || '',
            arrayProgramPlace: arrayProgramPlace || [],
            arrayWithLinkImages: arrayWithLinkImages || [],
            index: index_,
            dataTimeLocation: dataTimeLocation || {},
          }
        )
      }
      return {isResolved: true, data: arrayWithAllData};
    }catch(err){
      console.log('error at getAllPlacesAboutLocations', err)
      return {isResolved: false, err: err?.message};
    }
  }

}

module.exports = { ApiCompletionLocations }
