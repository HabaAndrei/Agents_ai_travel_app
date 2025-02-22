const axios = require('axios');
const {setDoc, getDoc, doc} = require("firebase/firestore");
const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');
const Firebase = require('../providers/Firebase.js');
const EnvConfig = require('../providers/EnvConfig.js');

const apiKeyGoogleMaps = EnvConfig.getInstance().get('API_KEY_GOOGLE_MAP');

class LocationGenerator extends OpenaiClient {

  constructor(){
    super()
    this.db = new Firebase().db;
  }

  /** get image of the city */
  async getUrlImageCity({city,  country}){
    try{
      const location = [city, country].join(' ');

      /** verify if exist in database */
      const docRef = doc(this.db, "image_places", location);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        return {isResolved: true, url: data.url};
      }

      // call google api to get the image
      const requestFormat = location.replaceAll(' ', '%20');
      /** get id o the place */
      const data = await axios.post(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?fields=place_id&input=${requestFormat}&inputtype=textquery&key=${apiKeyGoogleMaps}`);
      const place_id = data?.data?.candidates?.[0]?.place_id;
      if ( !place_id ) return {'isResolved': false};
      /** get image's reference */
      const detailsPlace = await axios.post(`https://maps.googleapis.com/maps/api/place/details/json?fields=photos&place_id=${place_id}&key=${apiKeyGoogleMaps}`);
      const reference = detailsPlace?.data?.result?.photos?.[0]?.photo_reference;
      /** get image url */
      const resultUrl = await this.getImgLink(reference);
      if (!resultUrl.isResolved) return {'isResolved': false};;
      // store the url in database
      if (resultUrl.url) {
        if(place_id)setDoc(doc(this.db, "image_places", location), {url: resultUrl.url});
        return {'isResolved': true, url: resultUrl.url};
      }else{
        return {'isResolved': false}
      }
    }catch(err){
      return {'isResolved': false}
    }
  }

  /** Return an array without duplicate values, verifying only the 'name' and 'alias' properties. */
  getUniqueValues(array){
    let newAr = [];
    array.forEach((data)=>{
      const {name, alias} = data;
      const find = newAr.find((d)=>d?.name === name || d?.alias === alias);
      if (!find) newAr.push(data);
    })
    return newAr;
  }

  /** this function returns link image for a specific reference, i do this with google api */
  async getImgLink(reference){
    let rezFin = {isResolved: true, url: ''};
    try{
      const data = await axios.get(`https://maps.googleapis.com/maps/api/place/photo?maxwidth=3000&photoreference=${reference}&key=${apiKeyGoogleMaps}`)
      const url = data.request.res.responseUrl;
      rezFin = {isResolved:true, url};
    }catch(err){
      rezFin = {isResolved:false, err: err?.message};
    }
    return rezFin;
  }

  /** This function retrieves location details from the Google Maps API */
  async getLocationDetailsFromGoogleApi({place, aliasLocation, description, indexPlace, city, country}){
    try{
      // create the url based on the api specification
      const input = [place, description, 'like', aliasLocation, 'City:', city, 'Country:', country].join('%20');
      const requestFormat = input.replaceAll(' ', '%20');
      const addressAndIdPlace = await axios.post(`https://maps.googleapis.com/maps/api/place/findplacefromtext/json?fields=formatted_address%2Cplace_id&input=${requestFormat}&inputtype=textquery&key=${apiKeyGoogleMaps}`);
      // verify to exist the location and get the place id
      if(!addressAndIdPlace?.data?.candidates?.[0]){
        console.log(`Place: ${place} => value: addressAndIdPlace?.data?.candidates?.[0] from function locationDetailsFromGoogleApi is undefined`);
        return {isResolved: false, err: 'value: addressAndIdPlace?.data?.candidates?.[0] from function locationDetailsFromGoogleApi is undefined'}
      }
      const {formatted_address, place_id} = addressAndIdPlace?.data?.candidates?.[0];
      const address = formatted_address;

      /** If the place already exists in the database, I send the data from the database */
      if(place_id){
        const docRef = doc(this.db, "places", place_id);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
          const data = docSnap.data();
          return {isResolved: true, data, index: indexPlace}
        }
      }

      /** get details based on place id */
      const detailsPlace = await axios.post(`https://maps.googleapis.com/maps/api/place/details/json?language=en%2Cfields=geometry%2Cname%2Copening_hours%2Cphotos%2Cwebsite%2Curl&place_id=${place_id}&key=${apiKeyGoogleMaps}`);

      const {url, website, name} = detailsPlace?.data?.result;
      const urlLocation = url;
      const geometry_location = detailsPlace?.data?.result?.geometry?.location;
      const arrayProgramPlace = detailsPlace?.data?.result?.opening_hours?.weekday_text;
      const referincesPhotosArray = detailsPlace?.data?.result?.photos?.map((ob)=>ob.photo_reference);

      /** get image link for each reference */
      let arrayWithLinkImages = [];
      const arrayWithPromisesImages = referincesPhotosArray.map((ref)=>{
        return this.getImgLink(ref);
      })
      const arrayWithResponsePromisesImages = await Promise.all(arrayWithPromisesImages);
      for(let rez of arrayWithResponsePromisesImages){
        if(!rez.isResolved)continue;
        else arrayWithLinkImages.push(rez.url)
      }

      /** create the result object */
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

      /** save the place in database */
      if(place_id)setDoc(doc(this.db, "places", place_id), obData);

      // send the result
      return {isResolved: true, data: obData, index: indexPlace}
    }catch(err){
      console.log('we have error at datafromgoogle, ', err);
      return {isResolved:false, err: err?.message};
    }
  }

  /** this function retrive visit packages for a specific location */
  async getVisitPackages({place, index, city, country}){
    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      // prompts and json schema
      const prompts = this.promptLoader.getPrompt('locationGenerator').getFunction('getVisitPackages');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${place}": place, "${city}": city, "${country}": country}
      });

      const Packages = z.object({
        package_description: z.string().describe('Maxim two sentences'),
        average_visiting_hours: z.number(),
        selected: z.boolean().describe('allways false')
      })
      JsonSchema = z.object({
        response: z.object({
          average_hours_visiting_full_location: z.number(),
          packages: z.array(Packages).describe('Include this property only if you can find available packages for the location. If no packages are available, do not include this property')
        })
      });
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_01_L');
    }

    try{
      /** Create the request to OpenAI and send the result based on the information received. */
      const resultTimeToLocationLlm =  await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultTimeToLocationLlm.isResolved){
        return {isResolved: false, err: resultTimeToLocationLlm?.err};;
      }
      let resultTour = resultTimeToLocationLlm?.data;
      return {isResolved: true, data: resultTour, index};
    }catch(err){
        return {isResolved: false, err};
    }
  }

  /** Verify if the locations are within the proximity area */
  async verifyProximitylocations(locations, prompt){
    // prompts and json schema
    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      const prompts = this.promptLoader.getPrompt('locationGenerator').getFunction('verifyProximitylocations');
      systemPrompt = prompts.systemPrompt.content;
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${prompt}": prompt, "${locations}": locations}
      });
      JsonSchema = z.object({
        response: z.object({
          isRespectingTheRules: z.boolean().describe('true / false'),
          reason: z.string().describe('This should contain a reason only if isRespectingTheRules is false; otherwise, it can be an empty string.')
        })
      })
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_02_L');
    }

    try {
      /** Create the request to OpenAI and send the result based on the information received. */
      const resultVerifyLocations = await this.retryLlmCallWithSchema({systemPrompt, userPrompt, JsonSchema});
      if(!resultVerifyLocations.isResolved){
        return {isResolved: false};
      }
      let result = resultVerifyLocations.data;
      return {isResolved: true, data: result?.isRespectingTheRules, reason: result?.reason ? result?.reason : ''};
    }catch(err){
      return {isResolved: false};
    }
  }

  /**
   * This function generates a location and simultaneously verifies if the response meets the expected criteria.
   * If the response does not meet the expectations, the function is called again, with a maximum of 3 retries.
   */
  async retryGenerateLocation({systemPrompt, userPrompt, JsonSchema}) {
    const prompts = this.promptLoader.getPrompt('locationGenerator').getFunction('generateLocations');
    let count = 0;
    let isRespectingTheRules = false;
    let rejectionReasonForProximityVerification = '';
    let resultLocations = '';

    while ((count < 4) && !isRespectingTheRules) {
      console.log('Function called with count =>>> ', count);
      console.log(rejectionReasonForProximityVerification, ' <<<<< ========  Rejection reason ');

      if (rejectionReasonForProximityVerification.length) {
        // Add a specific prompt for rejection
        systemPrompt += this.promptLoader.replace({
          data: prompts.systemPrompt.contentRejectionReason,
          changes: { "${rejectionReasonForProximityVerification}": rejectionReasonForProximityVerification }
        });
      }

      // Generate locations
      const resultLocationsLlm = await this.retryLlmCallWithSchema({ systemPrompt, userPrompt, JsonSchema });

      if (!resultLocationsLlm.isResolved) {
        return { isResolved: false, err: resultLocationsLlm?.err };
      }

      resultLocations = resultLocationsLlm.data;

      /** Verify the proximity of generated locations */
      const resultVerification = await this.verifyProximitylocations(resultLocations, userPrompt);

      // If the locations meet the rules, exit the loop by setting 'isRespectingTheRules' to true
      if (resultVerification?.isResolved && resultVerification?.data) isRespectingTheRules = true;

      rejectionReasonForProximityVerification += resultVerification?.reason;
      count += 1;
    }

    return resultLocations;
  }

  /** get locations to visit in a city */
  async generateLocations({city, country, customActivity, selectedActivities, isLocalPlaces, scaleVisit}){
    let systemPrompt, userPrompt, JsonSchema = '';
    try{
      const prompts = this.promptLoader.getPrompt('locationGenerator').getFunction('generateLocations');
      userPrompt = this.promptLoader.replace({
        data: prompts.userPrompt.content,
        changes: {"${city}": city, "${country}": country}
      });

      /** Based on the selected activities, the option to visit popular places (or not), and the chat, create a flexible prompt with a JSON schema. */
      let categories =  'This is the list of [Activities]: ' +  `${selectedActivities?.length ? selectedActivities?.join(', ') : ''}`
      +  `${selectedActivities?.length ? ', ' : '. '}` + `${customActivity ? customActivity : ''}`;

      /** Show multiple places to generate the LLM. */
      let numberOfPlacesPrompt = scaleVisit == '1'  ? '' :
      scaleVisit == '2' ? `Generate at least 6 locations to visit.` : scaleVisit == '3' ? `Generate at least 15 locations to visit.`  : '';

      systemPrompt = this.promptLoader.replace({
        data: prompts.systemPrompt.content,
        changes: {
          "${numberOfPlacesPrompt}": numberOfPlacesPrompt,
          "${categories}": categories
        }
      });

      /** local places or not */
      if (isLocalPlaces === 'true') {
        systemPrompt += JSON.stringify(prompts.systemPrompt.contentLocalPlaces)
      }

      /** json schema */
      const UniquePlacesSchema = z.object({
      	name: z.string().describe(`The name in english. The name should be relevant. For example, if you are in Brașov, Romania, and choose Poiana Brașov, don't just say 'Poiana'; say 'Poiana Brașov,' the full name.`),
        alias: z.string().describe("The name in the country's languge"),
        description: z.string().describe('Only one word description e.g: road, mountain, lake, church, museum, restaurant, shop')
      })
      JsonSchema = z.object({
      	response: z.object({
      		unique_places: z.array(UniquePlacesSchema)
      	})
      });
    }catch(err){
      return this.promptLoader.handleErrorPrompt(err, 'COD_03_L');
    }

    try{
      // create locations
      const resultLocations = await this.retryGenerateLocation({systemPrompt, userPrompt, JsonSchema});
      const {unique_places} = resultLocations;

      /** filter only unique places based on 'name' and 'alias' */
      const arWithNameAliasDescription = this.getUniqueValues(unique_places);

      /** get details for each location */
      const arrayWithCalls = arWithNameAliasDescription.map((objectNameAlias, index)=>{
        const {alias, description, name} = objectNameAlias;
        return this.getLocationDetailsFromGoogleApi({place: name, aliasLocation: alias, description, indexPlace: index, city, country});
      })
      const dataFromGoogleCalls = await Promise.all(arrayWithCalls);

      /** get visit packages for each location */
      const arrayCallsVisitPackages = arWithNameAliasDescription.map((objectNameAlias, index)=>{
        const {alias} = objectNameAlias;
        return this.getVisitPackages({place: alias, index, city, country})
      });
      const dataFromVisitPackages = await Promise.all(arrayCallsVisitPackages);

      /** associate packages with locations */
      const findVisitPackagesLocation = (index) => {
        const ob = dataFromVisitPackages.find((ob)=>ob.index === index);
        return !ob?.isResolved ? {} : {...ob?.data};
      };

      /** get url image of the city */
      const responseImageCity =  await this.getUrlImageCity({city,  country});
      const urlImageCity = responseImageCity?.url;

      /** associate details from google api with locations and create the response */
      let arrayWithAllLocations = [];
      for(let details of dataFromGoogleCalls){
        if(!details.isResolved)continue;
        const {location, place_id, arrayProgramPlace, arrayWithLinkImages, address,
          urlLocation, website, geometry_location} = details.data;
        const index_ = details.index;
        const dataTimeLocation = findVisitPackagesLocation(index_);
        const name = arWithNameAliasDescription?.[index_]?.name;
        arrayWithAllLocations.push(
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
      return {isResolved: true, data: arrayWithAllLocations, urlImageCity: urlImageCity || ''};
    }catch(err){
      console.log('error at generateLocations', err)
      return {isResolved: false, err: err?.message};
    }
  }

}

module.exports = LocationGenerator
