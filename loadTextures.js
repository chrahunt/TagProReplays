saveTextureSettings = function () {
    // read files values
    imageData = {}
    if (typeof $('#tilesInput')[0].files[0] !== 'undefined') {
        reader1 = new FileReader()
        reader1.onload = function (e1) {
            imageData.tiles = e1.target.result
        }
        reader1.readAsDataURL($('#tilesInput')[0].files[0])
    } else {
        imageData.tiles = undefined
    }
    if (typeof $('#portalInput')[0].files[0] !== 'undefined') {
        reader2 = new FileReader()
        reader2.onload = function (e2) {
            imageData.portal = e2.target.result
        }
        reader2.readAsDataURL($('#portalInput')[0].files[0])
    } else {
        imageData.portal = undefined
    }
    if (typeof $('#speedpadInput')[0].files[0] !== 'undefined') {
        reader3 = new FileReader()
        reader3.onload = function (e3) {
            imageData.speedpad = e3.target.result
        }
        reader3.readAsDataURL($('#speedpadInput')[0].files[0])
    } else {
        imageData.speedpad = undefined
    }
    if (typeof $('#speedpadredInput')[0].files[0] !== 'undefined') {
        reader4 = new FileReader()
        reader4.onload = function (e4) {
            imageData.speedpadred = e4.target.result
        }
        reader4.readAsDataURL($('#speedpadredInput')[0].files[0])
    } else {
        imageData.speedpadred = undefined
    }
    if (typeof $('#speedpadblueInput')[0].files[0] !== 'undefined') {
        reader5 = new FileReader()
        reader5.onload = function (e5) {
            imageData.speedpadblue = e5.target.result
        }
        reader5.readAsDataURL($('#speedpadblueInput')[0].files[0])
    } else {
        imageData.speedpadblue = undefined
    }
    if (typeof $('#splatsInput')[0].files[0] !== 'undefined') {
        reader6 = new FileReader()
        reader6.onload = function (e6) {
            imageData.splats = e6.target.result
        }
        reader6.readAsDataURL($('#splatsInput')[0].files[0])
    } else {
        imageData.splats = undefined
    }

    setTimeout(function () {
        console.log(imageData)

        // Send values to background script
        chrome.runtime.sendMessage({
            method: 'setTextureData',
            textureData: JSON.stringify(imageData)
        });

		// save texture data in local storage
        Object.keys(imageData).forEach(function(key){
			if(imageData[key] != undefined) {
				localStorage.setItem(key, imageData[key]);
			}
		})
    }, 100)
}
