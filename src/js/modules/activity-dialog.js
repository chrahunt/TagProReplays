const EventEmitter = require('events');
const ProgressBar = require('progressbar.js');

/**
 * Activity dialog.
 * 
 *     header
 *      body
 *   [progress]
 *     actions
 * 
 * @event ActivityDialog:[action]
 * @event ActivityDialog#closed
 */
class ActivityDialog extends EventEmitter {
  /**
   * @private
   */
  static get defaults() {
    return {
      dismissable: true,
      dismiss_text: 'Close',
      // Whether progress should show up.
      progress: true
    };
  }

  constructor($el, options = {}) {
    super();
    this.options = Object.assign({}, ActivityDialog.defaults, options);
    this.$el = $el;
    this.$el.modal({
      show: false
    });

    this.$el.on('hidden.bs.modal', () => {
      this.emit('closed');
    });

    let $progress = this.$el.find('.activity-progress');
    this.progressbar = new ProgressBar.Line($progress.get(0), {
      strokeWidth: 4,
      easing: 'easeInOut',
      duration: 200,
      color: 'rgb(27, 127, 204)',
      trailColor: '#eee',
      trailWidth: 1,
      svgStyle: {width: '100%', height: '100%'}
    });
    this._update_ui();
  }

  /**
   * Update options.
   */
  update(options) {
    this.options = Object.assign(this.options, options);
    this._update_ui();
  }

  /**
   * Reset options.
   */
  set(options) {
    this.options = Object.assign({}, ActivityDialog.defaults, options);
    this._update_ui();
  }

  show() {
    this.$el.modal('show');
  }

  hide() {
    this.$el.modal('hide');
  }

  header(text) {
    this.$el.find('.activity-header').text(text);
  }

  text(val) {
    this.$el.find('.activity-text').text(val);
  }

  /**
   * Set progress.
   * @param {number} val  progress in the range 0..1
   */
  progress(val) {
    this.progressbar.animate(val);
  }

  /**
   * @private
   */
  _update_ui() {
    if (this.options.dismissable) {
      this.$el.data('bs.modal').options.keyboard = true;
      this.$el.data('bs.modal').options.backdrop = true;
      this.$el.find('.activity-footer').removeClass('hidden');
      this.$el.find('.activity-dismiss').text(this.options.dismiss_text);
    } else {
      this.$el.data('bs.modal').options.keyboard = false;
      this.$el.data('bs.modal').options.backdrop = 'static';
      this.$el.find('.activity-footer').addClass('hidden');
    }
    if (this.options.progress) {
      this.$el.find('.activity-progress').removeClass('hidden');
    } else {
      this.$el.find('.activity-progress').addClass('hidden');
    }
  }
}

module.exports = ActivityDialog;