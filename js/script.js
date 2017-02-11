/*
Author: Baekchun Kim
*/

var bpdGeoStrings = []; //used for BPD use of force data
var weaponUsed = []; //array of weapons used by BPD
var map, heatmap, gradient, infowindow;
var serGeoStrings = []; //used for 311 service request data
var markers = []; // markers used for BPD use of force
var areas = []; //array of neighborhoods
var serviceType = []; //array of service or complaint types
var areaToCoord = new Map();

//autocomplete for neighborhood search box
$(function() {
  $( "#tags" ).autocomplete({
    source: areas,
    messages: {
      noResults: '',
      results: function() {}
    }
  });
});

//get the selected value from the neighborhood search box
$(document).ready(function() {
  $('#tags').on('autocompleteselect', function (e, ui) {
    $(".ui-helper-hidden-accessible").hide();
    event.preventDefault();
    var inpVal = ui.item.value;
    console.log(inpVal);
    heatmap.setData(getCoordinates("area", inpVal));
  });
});

//autocomplete for 311 service calls search box
$(function() {
  $( "#types" ).autocomplete({
    source: serviceType,
    messages: {
      noResults: '',
      results: function() {}
    }
  });
});

//get the selected value from the service calls search box
$(document).ready(function() {
  $('#types').on('autocompleteselect', function (e, ui) {
    $(".ui-helper-hidden-accessible").hide();
    event.preventDefault();
    var inpVal = ui.item.value;
    console.log(inpVal);
    heatmap.setData(getCoordinates("type", inpVal));
  });
});


// Initial API call to BPD Part 1 Victim Based Crime Data to 
// find coordinates of Baltimore's neighborhoods
// Create a map of neighborhood and its respective coordinates 

function createMap() {
  $.ajax({
    url: "https://data.baltimorecity.gov/resource/4ih5-d5d5.json",
    type: "GET",
    data: {
      "$limit" : 40000, 
      "$$app_token" : "bzFMaDaA0fi8LAr4FkpAyH0Am",
    }
  }).done(function(data) {
    console.log("map is made");
    areas.push("View all"); //first elem in this array will be "View All"
    for(var i = 0; i < data.length; i++) {
      if(data[i].neighborhood) {
        if(!areaToCoord.has(data[i].neighborhood.toUpperCase())) {
          areaToCoord.set(data[i].neighborhood.toUpperCase(), data[i].location_1);  
          areas.push(data[i].neighborhood.toUpperCase());
        }
      }
      //there are only 278 neighborhoods in Baltimore
      if(areaToCoord.size >= 278) {
        break;
      }
    }
    //once the map is created then retrieve service calls data
    getServiceCalls(); //get 311 service calls
  });
}

//API call to retrieve 311 service call requests
function getServiceCalls() {
  $.ajax({
    //Limit 311 service requests from Jan 1st 2015 to Dec 31st 2015
    url: "https://data.baltimorecity.gov/resource/q7s2-a6pd.json?$where=createddate between '2015-01-01T00:00:00' and '2015-12-31T23:59:00'",
    type: "GET",
    data: {
      "$limit" : 7000, //20000
      "$$app_token" : "bzFMaDaA0fi8LAr4FkpAyH0Am"
    }
  }).done(function(data) {
    console.log("311 service call requests are retrieved");
    var j = 0;    
    //console.log(areaToCoord);
    for(var i = 0; i < data.length; i++) {
      if(data[i].neighborhood && areaToCoord.has(data[i].neighborhood.toUpperCase()) 
        && data[i].codedescription) {
          var location = {
            lat: areaToCoord.get(data[i].neighborhood.toUpperCase()).coordinates[1],
            lng: areaToCoord.get(data[i].neighborhood.toUpperCase()).coordinates[0],
            type: formatString(data[i].codedescription), //type of complaint
            area: data[i].neighborhood
          };
        j++;
        serGeoStrings.push(location);
        // create list of 311 service types
        if(!serviceType.includes(location.type)) {
          serviceType.push(location.type);
        }
      }
    }
    console.log(serviceType);
    initMap();
    //API call to retrieve BPD data
    getBPDdata();
  });
}

//Remove Dept abbreviations from the string
function formatString(description) {
  var idx = description.indexOf("-"); //get rid of department names
  if(idx <= 0) {
    idx = description.indexOf(" "); //some don't have dashes before the dept name
  }
  return description.substring(idx + 1, description.length);
}

//API call to retrieve Baltimore Police Dept's use of force data
function getBPDdata() {
  $.ajax({
    //Limit BPD's use of force data from Jan 1st 2015 to Dec 31st 2015
    url: "https://data.baltimorecity.gov/resource/j5vd-se44.json?$where=date between '2015-01-01T00:00:00' and '2015-12-31T23:59:00'", //BPD use of force data
    type: "GET",
    data: {
      "$limit" : 100,
      "$$app_token" : "bzFMaDaA0fi8LAr4FkpAyH0Am",
      //select the data chosen by the user
    }
  }).done(function(data) {
    console.log("BPD's use of force data is retrieved");
    var j = 0;
    for (var i = 0; i < data.length; i++) {
      //some location fields in data set is 0.0000. Need to exclude such fields.
      if(data[i].x_long && data[i].y_lat ) {
        var location = {
          lat: data[j].y_lat,
          lng: data[j].x_long,
          type: data[j].type, //type of injury done 
          date: data[j].date.substring(0, 10)
        };
        j++;
        bpdGeoStrings.push(location);
      }
    }
  });
}

function initMap() {
  console.log("initMap is executed");
  var mapOptions = {
    zoom: 12,
    center: new google.maps.LatLng(39.298423, -76.615905), //Coordinates of center of BAL
    mapTypeId: 'hybrid'
  };

  infowindow = new google.maps.InfoWindow(); 
  map = new google.maps.Map(document.getElementById('map'), mapOptions);

  //call this once the API calls are done.
  heatmap = new google.maps.visualization.HeatmapLayer({
    data: getCoordinates("area", "View all"), //these are 311 service data points
  });

  //set and configure the heat map
  heatmap.setMap(map);
  setRadius(); 
  setOpacity(); 
  setGradient();  
}

function reset() {
  // Note: In the BDP's use of force data(2005) Impact weapon type data 
  // has null values for coordinates

  removeMarkers(); //removes the previously viewed markers
  var attackType = document.getElementById("category").value;

  if(attackType === "View all") {
    for(var i = 0; i < Object.keys(bpdGeoStrings).length; i++) {
        markers.push(addMarker(bpdGeoStrings[i])); //add markers to map  
    }
  } else {
      for(var i = 0; i < Object.keys(bpdGeoStrings).length; i++) {
        if(bpdGeoStrings[i].type === attackType) {
          markers.push(addMarker(bpdGeoStrings[i])); //add markers to map  
        }
      }  
  }
  google.maps.event.addDomListener(window, 'load', initMap);
}

function addMarker(geoString) {

  var marker = new google.maps.Marker({
    position: new google.maps.LatLng(geoString.lat, geoString.lng),
    icon: getWeaponUsed(geoString.type),
    zIndex: getWeaponUsed(geoString.type).zIndex,
    map: map
  });
  //add listener to pop up infowindow
   google.maps.event.addListener(marker, 'click', function(){
    infowindow.close(); // Close previously opened infowindow
    infowindow.setContent( "<div id='infowindow'>"+ 
      "Date: " + geoString.date + " , Type: " + geoString.type + "</div>");
    infowindow.open(map, marker); //open new infowindow
  });
  return marker;
}

function getWeaponUsed(weapon) {

  //array of weapons used by BPD
  weaponUsed = [
    {
      type: "Shooting",
      url: "images/gun.png",
      scaledSize: new google.maps.Size(27, 22),
      zIndex: 5
    },
    {
      type: "Taser",
      url: "images/taser_gun.jpg",
      scaledSize: new google.maps.Size(22, 27),
      zIndex: 4
    },
    {
      type: "Hands",
      url: "images/hand.jpg",
      scaledSize: new google.maps.Size(27, 22),
      zIndex: 3
    },
    {
      type: "Impact Weapon",
      url: "images/police_baton.jpg",
      scaledSize: new google.maps.Size(27, 22),
      zIndex: 1
    },
    {
      type: "Injured Person",
      url: "images/injured_person.jpg",
      scaledSize: new google.maps.Size(25, 25),
      zIndex: 2
    }
  ]; 

  for(var i = 0; i < weaponUsed.length; i++) {
    if(weaponUsed[i].type === weapon) {
      return weaponUsed[i];
    }
  }
  return {
    url: "images/other.jpg",
    scaledSize: new google.maps.Size(20, 20),
    zIndex: 10
  };
}

function removeMarkers(){
  if(markers.length != 0) {
    for(var i = 0; i < markers.length; i++){
        markers[i].setMap(null);
    }
  }
}

function setRadius() {
  console.log("setRadius function run");
  var radius = 35;
  heatmap.set('radius', heatmap.get('radius') ? null : radius); //set radius
}

function setOpacity() {
  console.log("setOpac function run");
  var opacity  = 0.5;
  heatmap.set('opacity', heatmap.get('opacity') ? null : opacity); //set opacity
}

function setGradient() {
  console.log("setGradient function run");
  gradient = [
    'rgba(0, 255, 255, 0)',
    'rgba(0, 255, 255, 1)',
    'rgba(0, 191, 255, 1)',
    'rgba(0, 127, 255, 1)',
    'rgba(0, 63, 255, 1)',
    'rgba(0, 0, 255, 1)',
    'rgba(0, 0, 223, 1)',
    'rgba(0, 0, 191, 1)',
    'rgba(0, 0, 159, 1)',
    'rgba(0, 0, 127, 1)',
    'rgba(63, 0, 91, 1)',
    'rgba(127, 0, 63, 1)',
    'rgba(191, 0, 31, 1)',
    'rgba(255, 0, 0, 1)'

  ];
  heatmap.set('gradient', heatmap.get('gradient') ? null : gradient); //set gradient
}

function getCoordinates(type, inpVal) {
  console.log("getCoordinates function run");
  var points = [];
  if(inpVal === "View all") {
    for(var i = 0; i < Object.keys(serGeoStrings).length; i++) {
      points.push(new google.maps.LatLng(serGeoStrings[i].lat, serGeoStrings[i].lng));
    }  
  } 
  else {
    if(type === "area") {
      for(var i = 0; i < Object.keys(serGeoStrings).length; i++) {
        if(serGeoStrings[i].area === inpVal) {
          points.push(new google.maps.LatLng(serGeoStrings[i].lat, serGeoStrings[i].lng));
        }
      }  
    } else {
      for(var i = 0; i < Object.keys(serGeoStrings).length; i++) {
        if(serGeoStrings[i].type === inpVal) {
          points.push(new google.maps.LatLng(serGeoStrings[i].lat, serGeoStrings[i].lng));
        }
      }
    }
  }
  return (points);
}
