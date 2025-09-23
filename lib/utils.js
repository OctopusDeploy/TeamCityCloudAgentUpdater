'use strict';

var colors = require('colors/safe');

function shortenImage(image) {
  //azure image id's are long and split with `/`. Humans only really care about the last segment.
  var splitImage = image.split('/')
  return splitImage[splitImage.length - 1]
}

function getAgentProperty(agent, propertyName) {
  var result = null;
  agent.properties.property.forEach(function(property) {
      if (property.name == propertyName) {
        result = property.value;
      }
    });
  return result;
}

function getFeatureProperty(feature, propertyName) {
  var result = null;
  feature.properties.property.forEach(function(property) {
    if (property.name == propertyName) {
      result = property.value;
    }
  });
  if (result)
    return result;
  console.log(colors.red("ERROR: Unable to find property '" + propertyName + "' on '" + JSON.stringify(feature) + "'. Exiting with code 5."));
  process.exit(5);
}

function setFeatureProperty(feature, propertyName, newValue) {
  feature.properties.property.forEach(function(property) {
    if (property.name == propertyName) {
      property.value = newValue;
      return;
    }
  });
}

module.exports = {
  shortenImage,
  getAgentProperty,
  getFeatureProperty,
  setFeatureProperty
};