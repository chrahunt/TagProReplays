/*eslint max-len: "off"*/
module.exports = {
  replay_list: {
    controls:
      `<div class="actions">
         {{^disabled}}<div class="row-download-movie disabled" title="render replay first!">{{/disabled}}
         {{#disabled}}<div class="row-download-movie" title="download movie">{{/disabled}}
         <i class="material-icons">file_download</i></div>
         <div class="row-preview" title="preview"><i class="material-icons">play_arrow</i></div>
       </div>`,
    import: {
      error_result:
        `There were some errors. You can download them
         <a href="{{url}}" download=\"import-errors.txt\">here</a>. Once downloaded, send them
         via the error reporting information you can find in \"Help\" in the menu.`,
      full:
        `Importing that many replays would fill up the database. Try selecting fewer replays,
         or download and remove replays to free up space.`,
      busy:
        `The background page is busy, try again later.`,
    }
  },
  table: {
    checkbox:
      `<paper-checkbox></paper-checkbox>`,
    select_all_checkbox:
      `<paper-checkbox></paper-checkbox>`,
    processing:
      `<tr class="processing">
         <th colspan="{{cols}}">
           <paper-progress indeterminate role="progressbar" value="0"></paper-progress>
         </th>
       </tr>`
  },
  icons: {
    previous: '<i class="material-icons">chevron_left</i>',
    next: '<i class="material-icons">chevron_right</i>'
  },
  importing: {
    start: "Importing your replays, don't navigate away from this page until the process is complete!"
  }
};
