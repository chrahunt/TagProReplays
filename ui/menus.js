// Code to set the header row to the same width as the replay table, if needed.
/*$('#menuContainer').on('shown.bs.modal', function() {
 $('#replay-headers').width($('#replayList table').width());
 });*/

// Handling multiple modals
// http://miles-by-motorcycle.com/fv-b-8-670/stacking-bootstrap-dialogs-using-event-callbacks
$(function () {
    $('.modal').on('hidden.bs.modal', function (e) {
        $(this).removeClass('fv-modal-stack');
        $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') - 1);
    });

    $('.modal').on('shown.bs.modal', function (e) {
        // keep track of the number of open modals
        if (typeof($('#tpr-container').data('open_modals')) == 'undefined') {
            $('#tpr-container').data('open_modals', 0);
        }

        // if the z-index of this modal has been set, ignore.
        if ($(this).hasClass('fv-modal-stack')) {
            return;
        }

        $(this).addClass('fv-modal-stack');

        $('#tpr-container').data('open_modals', $('#tpr-container').data('open_modals') + 1);

        $(this).css('z-index', 1040 + (10 * $('#tpr-container').data('open_modals')));

        $('.modal-backdrop').not('.fv-modal-stack').css(
            'z-index',
            1039 + (10 * $('#tpr-container').data('open_modals'))
        );


        $('.modal-backdrop').not('fv-modal-stack').addClass('fv-modal-stack');
    });
});
