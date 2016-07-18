var sanitize = require('sanitize-filename');

var Data = require('./data');

var logger = require('./logger')('renders');

function Renders() {}
module.exports = new Renders();
Renders.prototype.get = function(id) {
  return new Render(id);
};

function Render(id) {
  this.id = id;
}

Render.prototype.remove = function() {};

// might want to move this elsewhere.
Render.prototype.download = function() {
  return Data.getMovie(this.id).then(function (file) {
    var movie = new Blob([file.data], { type: 'video/webm' });
    var filename = sanitize(file.name);
    if (filename === "") {
      filename = "replay";
    }
    return {
      data: movie,
      name: `${filename}.webm`
    };
  });
};

