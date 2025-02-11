const FuzzySearch = require('fuzzy-search');

// singleton
class DestinationSearch {

  static getInstance(){
    if (!this.instance) {
      this.instance = new DestinationSearch();
      this.instance.dataCountryCities = require('../config/data_country_cities.json');
    }
    return this.instance;
  }

  searchDestination(input, country, value){
    if (!input?.length) return;
    let dataToSearch = this.dataCountryCities;
    if (value === 'city') dataToSearch = this.dataCountryCities.find(d=>d.name == country).cities;
    const searcher = new FuzzySearch(dataToSearch, ['name'], {
      caseSensitive: false,  caseSensitive: false, sort: true, threshold: 1
    });
    const result = searcher.search(value === 'city' ? input : country);
    return result.map((d)=>d.name);
  }

}



module.exports = DestinationSearch;

