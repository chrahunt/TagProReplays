saveTextureSettings = function() {
	// read files values
	imageData = {}
	if(typeof $('#tilesInput')[0].files[0] !== 'undefined') {
		reader1 = new FileReader() 
		reader1.onload = function(e1) {imageData.tiles=e1.target.result}
		reader1.readAsDataURL($('#tilesInput')[0].files[0])
	} else { imageData.tiles = undefined }
	if(typeof $('#portalInput')[0].files[0] !== 'undefined') {
		reader2 = new FileReader()
		reader2.onload = function(e2) {imageData.portal=e2.target.result}
		reader2.readAsDataURL($('#portalInput')[0].files[0])
	} else { imageData.portal = undefined }
	if(typeof $('#speedpadInput')[0].files[0] !== 'undefined') {
		reader3 = new FileReader()
		reader3.onload = function(e3) {imageData.speedpad=e3.target.result}
		reader3.readAsDataURL($('#speedpadInput')[0].files[0])
	} else { imageData.speedpad = undefined }
	if(typeof $('#speedpadredInput')[0].files[0] !== 'undefined') {
		reader4 = new FileReader()
		reader4.onload = function(e4) {imageData.speedpadred=e4.target.result}
		reader4.readAsDataURL($('#speedpadredInput')[0].files[0])
	} else { imageData.speedpadred = undefined }
	if(typeof $('#speedpadblueInput')[0].files[0] !== 'undefined') {
		reader5 = new FileReader()
		reader5.onload = function(e5) {imageData.speedpadblue=e5.target.result}
		reader5.readAsDataURL($('#speedpadblueInput')[0].files[0])
	} else { imageData.speedpadblue = undefined }

	setTimeout(function(){
		console.log(imageData)

		// Send values to background script
		chrome.runtime.sendMessage({method:'setTextureData',
								textureData:JSON.stringify(imageData)})
	
		// do 'saved' animation now
		$('#textureSaveFeedback').fadeIn()
		$('#textureSaveFeedback').fadeOut()
	}, 100)
}

exitTextureMenu = function() {
    $("#textureContainer").fadeOut() 
    setTimeout(function(){$("#textureContainer").remove()},500)
}

function openTextureMenu() {
  $('article').append('<div id=textureContainer>')
  $('#textureContainer').css({
            "width" : "500px",
            "height" : "400px",
            "position": "absolute",
            "margin": "auto",
            "top": "0",
            "left": "0",
            "right": "0",
            "bottom": "0",
            "zIndex": "101"})
  //$('#textureContainer').hide()
  
  // make a background
  $('#textureContainer').append('<img id=textureBackground>')
  $('#textureBackground')[0].style['background-color']='#E6E6E6'
  $('#textureBackground').css({
            "width" : "100%",
            "height" : "100%",
            "position": "absolute",
            "opacity" : "1"
  })
  
  // make a border for the background
  $('#textureBackground').after('<div id=textureBackgroundBorder>')
  $('#textureBackgroundBorder').css({
            "position" : "absolute",
            "top" : "0",
            "left" : "0",
            "right" : "0",
            "bottom" : "0",
            "border" : "solid 10px white"
  })
  
  // add title box
  $('#textureContainer').append('<div id=textureTitleBox>')
  $('#textureTitleBox').css({
            "width" : "80%",
            "height" : "10%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "10%",
            "left" : "10%"
  })
  $('#textureTitleBox').append('<txt id=textureTitleText>Select Texture Files')
  $('#textureTitleText').css({
            "width" : "100%",
            "position" : "absolute",
            "margin" : "auto",
            "text-align" : "center",
            "fontSize" : "40px",
            "color" : "black"
  })
  
  // add area for file selection
  $('#textureBackground').after('<div id=textureListBox>')
  $('#textureListBox').css({
            "width" : "100%",
            "height" : "50%",
            "position" : "absolute",
            "margin" : "auto",
            "top" : "30%",
            "left" : "0",
            "overflow" : "auto",
            "opacity" : "1",
            "z-index" : "101"
  })
  // tiles
  $('#textureListBox').append('<p><txt id=tilesText>Tiles File')
  $('#tilesText').css({
  			"color" : "black",
  			"margin-left" : "60px"
  })
  $('#tilesText').after('<input type="file" id=tilesInput>')
  $('#tilesInput').css({
  			"margin-left" : (150-$("#tilesText").width())+"px",
  			"color" : '#00CC00'
  })
  // portal
  $('#tilesInput').after('<p><txt id=portalText>Portal File')
  $('#portalText').css({
  			"color" : "black",
  			"margin-left" : "60px"
  })
  $('#portalText').after('<input type="file" id=portalInput>')
  $('#portalInput').css({
  			"margin-left" : (150-$("#portalText").width())+"px",
  			"color" : '#00CC00'
  })
  // speedpad
  $('#portalInput').after('<p><txt id=speedpadText>Speedpad File')
  $('#speedpadText').css({
  			"color" : "black",
  			"margin-left" : "60px"
  })
  $('#speedpadText').after('<input type="file" id=speedpadInput>')
  $('#speedpadInput').css({
  			"margin-left" : (150-$("#speedpadText").width())+"px",
  			"color" : '#00CC00'
  })
  // speedpadred
  $('#speedpadInput').after('<p><txt id=speedpadredText>Speedpadred File')
  $('#speedpadredText').css({
  			"color" : "black",
  			"margin-left" : "60px"
  })
  $('#speedpadredText').after('<input type="file" id=speedpadredInput>')
  $('#speedpadredInput').css({
  			"margin-left" : (150-$("#speedpadredText").width())+"px",
  			"color" : '#00CC00'
  })
  // speedpadblue
  $('#speedpadredInput').after('<p><txt id=speedpadblueText>Speedpadblue File')
  $('#speedpadblueText').css({
  			"color" : "black",
  			"margin-left" : "60px"
  })
  $('#speedpadblueText').after('<input type="file" id=speedpadblueInput>')
  $('#speedpadblueInput').css({
  			"margin-left" : (150-$("#speedpadblueText").width())+"px",
  			"color" : '#00CC00'
  })		 
  
  // save button
  $('#textureContainer').append('<p><center><button id="textureSaveButton">Save')
  $('#textureSaveButton').css({
  			"bottom" : "15px",
  			"left" : ($("#textureContainer").width()/2 - $("#textureSaveButton").width()/2 - 10)+"px",
  			"position" : "absolute",
  			"zIndex" : "102",
  			"text-align" : "center"
  })
  $('#textureSaveButton')[0].onclick = saveTextureSettings
  
  $('#textureContainer').append('<a id=textureSaveFeedback>Saved!')
  $('#textureSaveFeedback').css({
  			"bottom" : "15px",
  			"left" : ($("#textureContainer").width()/2 + $("#textureSaveButton").width()/2 + 10 + 5)+"px",
  			"position" : "absolute"
  })
  			 
  $('#textureSaveFeedback').hide()
    
  // exit button
  $('#textureContainer').append('<a id=textureExitButton href=#>X')
  $('#textureExitButton').css({
    'position':'absolute',
    'background-color':'grey',
    'color' : 'black',
    'top' : '10px',
    'right' : '10px',
    'fontWidth' : 'bold',
    'fontSize' : '20px'
  })
  $('#textureExitButton')[0].onclick = exitTextureMenu
}




