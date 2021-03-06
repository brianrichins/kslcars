var crawler
, sentinel
, createSentinel
, http = require('http')
, savedCarAds = []
, getDetail
, createCrawler = function(eventManager){
    
    var loadListPage
    , loadCarPage
    , carSaved
    , carPageLoaded
    , listPageLoaded
    , parseAdId
    , getDetail
    , getTelephone
    , getLocation
    , getZip
    , makeCarUrl
    , getAdId
    , page = 1;

    parseAdId = function(url){
        return url.match(/\/auto\/listing\/([\d-]*)(.*)/i)[1];
    };

    makeCarUrl = function(adId){
        return "http://www.ksl.com/auto/listing/" + adId;
    };

    carSaved = function(error, carDetails){
        savedCarAds.push(carDetails.adId.toString());
    };

    getDetail = function(attribute, source){
        var regex = new RegExp('<td>'+attribute+':<\/td>\\s*<td>(.*)<\/td>');
        return source.match(regex)[1];
    };

    getTelephone = function(source){
        var telephone;
        try{
            telephone = source.match(/"tel:\s*(.*)"/)[1];
        }
        catch(exception){}
        return telephone;
    };

    getZip = function(source){
        var zip;
        try{
            zip = source.match(/class="address.*\s\w\w\s(\d{5})/)[1];
        }
        catch(exception){}
        return zip;
    };

    getLocation = function(source){
        return source.match(/class="location">\s*(.*)\s\|/)[1];
    };


    getPostedDate = function(source){
        //gets the location so we can take it out
        var replaceAbleLocation = source.match(/class="location">\s*(.*)\s\|/)[0];
        // takes out the location and cleanes up some other html stuff 
        var postedDate = source.match(/class="location">\s*(.*)</)[0].replace(replaceAbleLocation, '').replace('<','').replace('Posted','').trim();
        // turns months into numbers
        postedDate = postedDate.toLowerCase();
        postedDate = postedDate.replace("january", "01").replace("february", "02").replace("march", "03").replace("april", "04").replace("may", "05")
                        .replace("june", "06").replace("july", "07").replace("august", "08").replace("september", "09").replace("october", "10")
                        .replace("november", "11").replace("december", "12");
        // formats the date
        postedDate = postedDate.replace(/\s/g, "-").replace(",", "");
        // checks to make sure we have a correct date
        var dashCount = postedDate.match(/-/g);  


        if (dashCount.length === 1){
            postedDate = postedDate + "-" + new Date().getFullYear();
        } else if (dashCount.length === 0){
            postedDate = "01-01-" + postedDate;   
        }
       
        var dateArray = postedDate.split("-");
        
        var finishDate = dateArray[2]+ "-" +dateArray[0]  + "-" + dateArray[1];
        
        //checks to see that crawler hasnt come passed the desided days
        var postedDateObject =  new Date(dateArray[2], (parseInt(dateArray[0]) -1), dateArray[1])
        var currentData = new Date();
        var timeDiff = Math.abs(currentData.getTime() - postedDateObject.getTime());
        var diffDays = (Math.ceil(timeDiff / (1000 * 3600 * 24)) - 1); 
        
        console.log('postedDate: '+finishDate); 
        console.log('diffDays: '+diffDays);
        
        if (diffDays > global.daysBack){
            console.log('Posted Date passed desided days. Rest crawler');
            page = 1;
            eventManager.emit('sentinel:pageLoaded');
        }
        
        return finishDate;
    };

    getPrice = function(source){
        return parseInt(source.match(/class="price.*?">(?:MSRP\s)?(.*?)<span/)[1].replace(',', '').replace('$', ''));
    };

    getAdId = function(source){
        return source.match(/id="ad_id".*>(.*)<\/div/)[1];
    };

    carPageLoaded = function(errors, carPage){
        
        try {
            
            var getCarDetails = function(){
                var carDetails = {};
                carDetails['make'] = getDetail('Make', carPage);
                carDetails['model'] = getDetail('Model', carPage);
                carDetails['year'] = parseInt(getDetail('Year', carPage));
                carDetails['mileage'] = parseInt(getDetail('Mileage', carPage).replace(',', ''));
                carDetails['transmission'] = getDetail('Transmission', carPage);
                carDetails['telephone'] = getTelephone(carPage);
                carDetails['price'] = getPrice(carPage);
                carDetails['adId'] = getAdId(carPage);
                carDetails['zip'] = getZip(carPage);
                carDetails['titleType'] = getDetail('Title Type', carPage);
                carDetails['location'] = getLocation(carPage);
                carDetails['postedDate'] = getPostedDate(carPage);
                return carDetails;
            }
        
            if(errors){
                console.log('Error: '+errors.message);
            }
            else{
                eventManager.emit('data:saveCar', getCarDetails());
            }
            eventManager.emit('sentinel:pageLoaded');
        
        }catch(err){
            console.log("\n carPageLoaded Error: "+ err);

            eventManager.emit('sentinel:pageLoaded');
        }

        
    };

    listPageLoaded = function(carPages){
        try {
            var iter;

            for(iter = 0; iter < carPages.length; iter++){
                eventManager.emit('sentinel:addCarPage', parseAdId(carPages[iter]));
            } 

            eventManager.emit('sentinel:pageLoaded');
        
        }catch(err){
            console.log("\n listPageLoaded Error: "+ err);
            console.log("\n carPages: "+ JSON.stringify(carPages));
            page = 1;
            eventManager.emit('sentinel:pageLoaded');

          }

    };

    loadListPage = function(urlIn){


        var url = urlIn +'&page=' + page
        
        if (global.runBackLog === 'true'){
            page = page + 1;
        }
      
        console.log('\n>>>> loading '+ url);
        http.get(url, function(res) {
            var data = '';
            res.on('data', function (chunk) {
                data = data + chunk;
            });
            res.on('end', function () {
                listPageLoaded(data.match(/<div class="srp-listing-title">(.*)href="(.*)"(.*)<\/div>/gim));
            });
        }).on('error', function(e) {
            console.log("Got error: " + e.message);
        });
    };

    loadCarPage = function(adID){
        if(savedCarAds.indexOf(adID) > -1){
            eventManager.emit('sentinel:pageLoaded');
            return;
        }
        var url = makeCarUrl(adID);
        console.log('\n>>> loading '+url);
        http.get(url, function(res) {
            var data = '';
            res.on('data', function (chunk) {
                data = data + chunk;
            });
            res.on('end', function () {
                carPageLoaded(null, data);
            });
        }).on('error', function(e) {
            carPageLoaded(e, null);
        });
    };

    eventManager.on('data:carSaved', carSaved);
    eventManager.on('crawler:loadCarPage', loadCarPage);
    eventManager.on('crawler:loadListPage', loadListPage);

    return {};
};

createSentinel = function(eventManager){
    var listPages = []
    , carPages = []
    , addListPage
    , addCarPage
    , pageLoaded
    , carSaved
    , state = 'off'
    , added
    , start
    , stop
    , gotAllAdIds
    , initiating
    , loadNext;

    addCarPage = function(adID){
        //console.log(adID+ ' added');
        carPages.push(adID);
        added();
    };

    addListPage = function(url){
        //console.log(url+ ' added');
        listPages.push(url);
        added();
    };

    added = function(){
        //console.log('state is '+state);
        if(state === 'waiting'){
            loadNext();
        }
    };

    start = function(){
        //console.log('sentinel started');
        state = 'waiting';
        if(!initiating){
            loadNext();
        }
    };

    pageLoaded = function(){
        //console.log('pageLoaded');
        if(state !== 'off'){
            loadNext();
        }
    };

    loadNext = function(){
        //console.log('loadNext');
        var next;
        state = 'running';

        next = carPages.pop();
        if(typeof next !== 'undefined'){
            eventManager.emit('crawler:loadCarPage', next);
            return;
        }
        
        next = listPages.pop();
        if(typeof next !== 'undefined'){
            eventManager.emit('crawler:loadListPage', next);
            return;
        }

        state = 'waiting';
        setTimeout(function() {
            addListPage(global.kslStart);
        }, 500);
    };

    stop = function(){
        state = 'off';
    };

    gotAllAdIds = function(error, adIds){
        savedCarAds = adIds;
        initiating = false;
        if(state === 'waiting'){
            start();
        }
    };

    eventManager.on('sentinel:addCarPage', addCarPage);
    eventManager.on('sentinel:addListPage', addListPage);
    eventManager.on('sentinel:start', start);
    eventManager.on('sentinel:stop', stop);
    eventManager.on('sentinel:pageLoaded', pageLoaded);
    eventManager.once('data:gotAllAdIds', gotAllAdIds);

    initiating = true;
    eventManager.emit('data:getAllAdIds');
};

exports.initCrawler = function(eventManager){
    if(typeof crawler === 'undefined'){
        crawler = createCrawler(eventManager);
    }
    if(typeof sentinel === 'undefined'){
        sentinel = createSentinel(eventManager);
    }
    return {};
};
