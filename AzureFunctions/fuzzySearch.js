const FuzzySearch = require('fuzzy-search');
const dataCountryCities = require('./dataCountryCities.json');

module.exports = async function (context, req) {

  const {input, country, value} = req.body;

  let rez = [];

  if(input?.length){
    if(value == 'city'){
      let specificCountry = dataCountryCities.find(d=>d.name == country).cities;
      const searcher = new FuzzySearch(specificCountry, ['name'], {
        caseSensitive: false, sort: true, threshold: 1
      });
      const result = searcher.search(input).slice(0, 5);
      rez = result.map((d)=>d.name);
    }else if(value == 'country'){
      const searcher = new FuzzySearch(dataCountryCities, ['name'], {
        caseSensitive: false,  caseSensitive: false, sort: true, threshold: 1
      });
      const result = searcher.search(country).slice(0, 5);
      rez = result.map((d)=>d.name);
    }
  }

  context.res = {
    body: rez
  };
}
