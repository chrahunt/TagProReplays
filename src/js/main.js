// Main menu js.
var Menu = require('./modules/menu');

var menu = new Menu();
setTimeout(() => {
  menu.open();
}, 500);
