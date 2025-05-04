const axios = require('axios');
const  {expect, test} = require('@jest/globals');
const countriesCities = require('./tests/countriesCities.json');
const activities = require('./tests/activities.json');
const locations = require('./tests/locations.json');
const EnvConfig = require('./providers/EnvConfig.js');
const crypto = require("crypto")

const serverAddress = EnvConfig.getInstance().get('URL_SERVER')


// command: jest tests.test.js


function createHeader(body){
  const customToken = EnvConfig.getInstance().get('AUTHORIZATION_CUSTOM_TOKEN');
  let token = crypto.createHash('sha256').update(JSON.stringify(body) + customToken).digest('hex')
  return {
    headers: {
      Authorization: token,
      'Content-Type': 'application/json'
    }
  }
}

////////////////////////////////////////////////////
// test for activities

async function generateActivities({city, country}){
  const body = {
    generationType: 'generateActivities', city, country
  }
  const result = await axios.post(serverAddress, body, createHeader(body));
  return result.data
}

function testParallelActivities(){
  test('run all activity generations in parallel', async () => {
    const results = await Promise.all(
      countriesCities.map(({ city, country }) =>
        generateActivities({ city, country })
      )
    );

    results.forEach((result, index) => {
      console.log(index);
      expect(result.isResolved).toBe(true);
      expect(result.data.activities[0]).toBeDefined();
      expect(result.paramsLocation.isResolved).toBe(true);
      expect(result.paramsLocation.data).toBeDefined();
      expect(typeof result.paramsLocation.data.local_places_and_tourist_places).toBe('boolean');
      expect(result.paramsLocation.data.scale_visit).toBeDefined();
    });
  }, 20000);
}
// testParallelActivities();

function testActivities(){
  test.each(countriesCities)('verify response from activities generator', async ({city, country}) => {
    const result = await generateActivities({city, country});

    expect(result.isResolved).toBe(true);
    expect(result.data.activities[0]).toBeDefined();
    expect(result.paramsLocation.isResolved).toBe(true);
    expect(result.paramsLocation.data).toBeDefined();
    expect(result.paramsLocation.data.local_places_and_tourist_places).toBe(true || false);
    expect(result.paramsLocation.data.scale_visit).toBeDefined();
  }, 15000)
}
// testActivities()



////////////////////////////////////////////////////
// test for locations

async function generateLocations({city, country, customActivity, selectedActivities, isLocalPlaces, scaleVisit}){
  const body = {
    generationType: 'generateLocations',
    city, country, customActivity, selectedActivities, isLocalPlaces, scaleVisit
  };
  const result = await axios.post(serverAddress, body, createHeader(body));

  return result.data;
}

function testLocations(){
  test.each(activities)('verify response from locations generator', async (details) => {

    const result = await generateLocations(details);

    expect(result.isResolved).toBe(true);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: expect.any(String),
          address: expect.any(String),
          place_id: expect.any(String),
          urlLocation: expect.any(String),
          website: expect.any(String),
          geometry_location: expect.any(Object),
          arrayProgramPlace: expect.any(Array),
          arrayWithLinkImages: expect.any(Array),
          dataTimeLocation: expect.any(Object)

        })
      ]),
      expect(result.urlImageCity).toBeDefined()
    );

  }, 2000000)
}
// testLocations();


// ////////////////////////////////////////////////////
// // test for programs

async function generateProgram(){

  const startDate = '2024-02-11';
  const endDate = '2024-06-11';
  const country = 'Romania';
  const city = 'Brasov';
  const hotelAddress = '';

  const body = {generationType: 'generateProgram', startDate, endDate, city, country, locations, hotelAddress};
  const result = await axios.post(serverAddress, body, createHeader(body));
  return result.data;

}

function testProgram(){
  test.each(
    Array(20).fill()
  )('verify response from program generator', async () => {
    const result = await generateProgram();

    expect(result.isResolved).toBe(true);
    expect(result.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          day: expect.any(Number),
          title: expect.any(String),
          date: expect.any(String),
          activities: expect.arrayContaining([
            expect.objectContaining({
              time: expect.any(String),
              place: expect.any(String),
              address: expect.any(String),
              urlLocation: expect.any(String),
              place_id: expect.any(String),
              website: expect.any(String),
              description: expect.any(String),
              info: expect.any(String),
              geometry_location: expect.any(Object),
              arrayWithLinkImages: expect.any(Array),
              dataTimeLocation: expect.any(Object),
            })
          ])
        })
      ])
    )
  }, 15000);
}
// testProgram()
