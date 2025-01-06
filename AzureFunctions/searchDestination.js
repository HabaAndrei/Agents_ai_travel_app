const FuzzySearch = require('fuzzy-search');
const dataCountryCities = require('./dataCountryCities.json');

function searchDestination(input, country, value){
  if(!input?.length)return;
  if(value == 'city'){
    let specificCountry = dataCountryCities.find(d=>d.name == country).cities;
    const searcher = new FuzzySearch(specificCountry, ['name'], {
      caseSensitive: false, sort: true, threshold: 1
    });
    const result = searcher.search(input);
    return result.map((d)=>d.name);
  }else if(value == 'country'){
    const searcher = new FuzzySearch(dataCountryCities, ['name'], {
      caseSensitive: false,  caseSensitive: false, sort: true, threshold: 1
    });
    const result = searcher.search(country);
    return result.map((d)=>d.name);
  }
}

module.exports={ searchDestination }