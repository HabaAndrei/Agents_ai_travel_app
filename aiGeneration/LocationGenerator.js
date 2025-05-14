const axios = require('axios');
const z = require("zod");
const OpenaiClient = require('../providers/OpenaiClient');
const Firebase = require('../providers/Firebase.js');
const EnvConfig = require('../providers/EnvConfig.js');
const fs = require('fs');
const sharp = require('sharp');

const apiKeyGoogleMaps = EnvConfig.getInstance().get('API_KEY_GOOGLE_MAP');
const apiKeyTiqets = EnvConfig.getInstance().get('TIQETS_API_TOKEN');

class LocationGenerator extends OpenaiClient {

  constructor(){
    super()
    this.db = new Firebase().db;
  }

  /** await function */
  async awaitSeconds(seconds) {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve();
      }, seconds * 1000);
    });
  }

  /** retry function for get tickets from our provider */
  async retryGetTikets(product){
    let count = 0;
    let result = '';
    while ( count < 3 ) {
      result = await this.getTickets(product);
      if (result.statusCode === 429) {
        await this.awaitSeconds(0.5);
        count += 1;
        continue;
      }
      return result;
    }
    return result;
  }

  async getTickets({name, latitude, longitude}){

    /** put in url the affilate parameter */
    const createAffiliateUrl = (baseUrl) => {
      const separator = baseUrl.includes('?') ? '&' : '?';
      const affiliateLink = `${baseUrl}${separator}partner=travelbot-174935`;
      return affiliateLink;
    }

    try {
      const a = await axios.get(`https://api.tiqets.com/v2/products?lat=${latitude}&lng=${longitude}&max_distance=1&sort=distance asc&query=${name}&require_venue=true`, {
        headers: {
          'Authorization': `Token ${apiKeyTiqets}`,
          'Accept': 'application/json'
        }
      })
      // get products
      const products = a?.data?.products ?? [];
      // filter the products that only have address
      const filtredProducts = products?.
        filter((product)=>product.venue.address && product.venue.postal_code)?.
        map((product)=>{
          return {
            // Get only the title of the product and url
            product_url: createAffiliateUrl(product?.product_url),
            titile: product.title
          }
        })
      return {isResolved: true, data: filtredProducts ?? []};
    }catch(err){
      return {isResolved: false, statusCode: err?.status};
    }
  }

  /** get image of the city */
  async getUrlImageCity({city,  country}){
    try{
      const location = [city, country].join(' ');

      /** verify if exist in database */
      const docRef = this.db.collection('image_places').doc(location);
      const docSnap = await docRef.get();
      if (docSnap.exists){
        const data = docSnap.data();
        return {isResolved: true, url: data.url};
      }

      /** get id o the place */
      const {place_id} = await this.getPlaceIdAndAddress(location);
      if ( !place_id ) return {'isResolved': false};

      /** get image's name */
      const detailsPlace = await this.getDetailsPlaces({place_id, fields: 'photos'})
      const name = detailsPlace.data.photos[0].name;

      /** get image url */
      const resultUrl = await this.getImgLink(name);
      if (!resultUrl.isResolved) return {'isResolved': false};

      // store the url in database
      if (resultUrl.url) {
        if(place_id)this.db.collection('image_places').doc(location).set({url: resultUrl.url});
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
  async getImgLink(name){
    try{
      // get image buffer
      const data = await axios.get(
        `https://places.googleapis.com/v1/${name}/media?key=${apiKeyGoogleMaps}&maxWidthPx=900`,
        {responseType: "arraybuffer"}
      );
      // remove parts of url
      const responseUrl = data.request.res.responseUrl;
      const lastIndex = responseUrl.lastIndexOf('/');
      const url = responseUrl.slice(lastIndex + 1, responseUrl.length);
      // store the image localy
      // ( to access the image from server: server address + /images/ + url + .jpg )
      const path = `./images/${url}.jpg`;
      // if the file doesn t exist, we store it compressed
      sharp(data.data)
        // .resize({ width: 800 })
        // .jpeg({ quality: 70 })
        .toFile(path);
      return {isResolved: true, url: url ? url : '' };
    }catch(err){
      return {isResolved: false, err: err?.message};
    }
  }

  async getPlaceIdAndAddress(textQuery){
    const addressAndIdPlace = await axios.post(`https://places.googleapis.com/v1/places:searchText`,
      {"textQuery" : textQuery},
      {
        headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKeyGoogleMaps,
            'X-Goog-FieldMask': 'places.formattedAddress,places.id'
        }
      }
    )

    // verify to exist the location and get the place id
    if(!addressAndIdPlace.data.places[0]){
      console.log(`Place: ${place} => value: addressAndIdPlace.data.places[0] from function locationDetailsFromGoogleApi is undefined`);
      return {isResolved: false, err: 'value: addressAndIdPlace.data.places[0] from function locationDetailsFromGoogleApi is undefined'}
    }
    const address = addressAndIdPlace.data.places[0]?.formattedAddress;
    const place_id = addressAndIdPlace.data.places[0]?.id;
    return {address, place_id};
  }

  async getDetailsPlaces({place_id, fields}){
    const detailsPlace = await axios.get(`https://places.googleapis.com/v1/places/${place_id}?fields=${fields}&key=${apiKeyGoogleMaps}`);
    return detailsPlace;
  }

  /** This function retrieves location details from the Google Maps API */
  async getLocationDetailsFromGoogleApi({place, aliasLocation, description, indexPlace, city, country, buyTicket}){
    try{

      /** If the place already exists in the database (with the same name, country and city), I send the data from the database */
      const citiesRef = this.db.collection('places');
      const snapshot = await citiesRef.where('city', '==', city).where('country', '==', country).where('location', '==', place).get();
      if (!snapshot.empty) {
        const doc = snapshot?.docs?.[0];
        return {isResolved: true, data: doc?.data(), index: indexPlace}
      }

      // create the url based on the api specification
      const textQuery = [place, description, 'like', aliasLocation, 'City:', city, 'Country:', country].join(' ');
      const {place_id, address} = await this.getPlaceIdAndAddress(textQuery)

      /** If the place already exists in the database (with place id), I send the data from the database */
      if(place_id){
        const docRef = this.db.collection('places').doc(place_id);
        const docSnap = await docRef.get();
        if (docSnap.exists){
          const data = docSnap.data();
          return {isResolved: true, data, index: indexPlace}
        }
      }

      /** get details based on place id */
      const fields = 'location,location,displayName,currentOpeningHours,websiteUri,googleMapsUri,photos';
      const detailsPlace = await this.getDetailsPlaces({place_id, fields})

      const geometry_location = detailsPlace.data.location;
      const name = detailsPlace.data.displayName.text;
      const arrayProgramPlace = detailsPlace.data?.currentOpeningHours?.weekdayDescriptions;
      const website = detailsPlace.data.websiteUri;
      const urlLocation = detailsPlace.data.googleMapsUri;
      // get only 6 photo names
      const photosNames = detailsPlace.data.photos?.map((i)=>i.name)?.slice(0, 6);

      /** get image link for each reference */
      let arrayWithLinkImages = [];
      if (photosNames?.length) {
        const arrayWithPromisesImages = photosNames.map((name)=>{
          return this.getImgLink(name);
        })
        const arrayWithResponsePromisesImages = await Promise.all(arrayWithPromisesImages);
        for(let rez of arrayWithResponsePromisesImages){
          if(!rez.isResolved)continue;
          else arrayWithLinkImages.push(rez.url)
        }
      }

      /** get tickets */
      let tickets = [];
      if (buyTicket && geometry_location.latitude && geometry_location.longitude) {
        const resultTickets = await this.retryGetTikets(
          { latitude: geometry_location.latitude, longitude: geometry_location.longitude, name: place }
        );
        if ( resultTickets.isResolved ) tickets = resultTickets?.data;
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
        arrayWithLinkImages: arrayWithLinkImages ? arrayWithLinkImages : [],
        city: city,
        country: country,
        tickets: tickets
      }

      /** save the place in database */
      if(place_id)this.db.collection('places').doc(place_id).set(obData);

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

    while ((count < 2) && !isRespectingTheRules) {
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
      	name: z.string().describe(`The name of the place in english. The name should be relevant. For example, if you are in Brașov, Romania, and choose Poiana Brașov, don't just say 'Poiana'; say 'Poiana Brașov,' the full name in ENGLISH.`),
        alias: z.string().describe("The name in the country's languge"),
        description: z.string().describe('Only one word description e.g: road, mountain, lake, church, museum, restaurant, shop'),
        buyTicket: z.boolean().describe("If I have to buy a ticket to visit that location: if it's a mountain, that's false because I don't need to buy a ticket; but if it's a place with attractions that require a ticket, then it's true.")
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
        const {alias, description, name, buyTicket} = objectNameAlias;
        return this.getLocationDetailsFromGoogleApi({place: name, aliasLocation: alias, description, indexPlace: index, city, country, buyTicket});
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

      if (!(dataFromGoogleCalls?.filter((response)=>response?.isResolved))?.length){
        return {isResolved: false, err: 'Unfortunately, all API calls had a bad response'};
      }

      /** associate details from google api with locations and create the response */
      let arrayWithAllLocations = [];
      for(let details of dataFromGoogleCalls){
        if(!details.isResolved)continue;
        const {location, place_id, arrayProgramPlace, arrayWithLinkImages, address,
          urlLocation, website, geometry_location, tickets} = details.data;
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
            tickets: tickets || []
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
