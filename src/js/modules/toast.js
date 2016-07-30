var Mustache = require('mustache');
var $ = require('jquery');

var logger = require('./logger')('toast');

/**
 * Create a toast.
 * spec has text, duration, id, action.
 */
function Toast(spec) {
  this.$ = $(Mustache.render(Toast._template, spec));
  this.el = this.$.get(0);
  $('body').append(this.$);
  this.$.find('paper-button').click(() => {
    spec.action_fn();
    this.el.close();
  });
  this.el.open();
}

Toast._template =
  `<paper-toast id="{{id}}" duration="{{duration}}" text="{{text}}">
     <paper-button>{{action}}</paper-button>
   </paper-toast>`;

Toast._instances = 0;

module.exports = Toast;
