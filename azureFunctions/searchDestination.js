const FuzzySearch = require('fuzzy-search');
const dataCountryCities = require('./dataCountryCities.json');

function searchDestination(input, country, value){
  if (!input?.length) return;
  let dataToSearch = dataCountryCities;
  if (value === 'city') dataToSearch = dataCountryCities.find(d=>d.name == country).cities;
  const searcher = new FuzzySearch(dataToSearch, ['name'], {
    caseSensitive: false,  caseSensitive: false, sort: true, threshold: 1
  });
  const result = searcher.search(value === 'city' ? input : country);
  return result.map((d)=>d.name);
}

module.exports={ searchDestination }