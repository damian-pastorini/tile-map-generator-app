/**
 *
 * Reldens - Tile Map Generator App
 *
 */

window.addEventListener('DOMContentLoaded', () => {

    // helpers:
    let location = window.location;

    function getCookie(name)
    {
        let value = `; ${document.cookie}`;
        let parts = value.split(`; ${name}=`);
        if(2 === parts.length){
            return parts.pop().split(';').shift()
        }
    }

    function deleteCookie(name)
    {
        document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
    }

    function escapeHTML(str)
    {
        return str.replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    function cloneElement(element)
    {
        if(element instanceof HTMLCanvasElement){
            let clonedCanvas = document.createElement('canvas');
            clonedCanvas.width = element.width;
            clonedCanvas.height = element.height;
            let ctx = clonedCanvas.getContext('2d');
            ctx.drawImage(element, 0, 0);
            return clonedCanvas
        }
        return element.cloneNode(true);
    }

    function fetchMapFileAndDraw(mapJson, tileset, mapCanvas, withTileHighlight, tileClickCallback)
    {
        if(!mapJson){
            return false;
        }
        fetch(mapJson)
            .then(response => response.json())
            .then(data => {
                mapCanvas.width = data.width * data.tilewidth;
                mapCanvas.height = data.height * data.tileheight;
                let mapCanvasContext = mapCanvas.getContext('2d');
                drawMap(mapCanvasContext, tileset, data);
                drawTiles(mapCanvasContext, mapCanvas.width, mapCanvas.height, data.tilewidth, data.tileheight);
                if(withTileHighlight){
                    mapCanvas.addEventListener('mousemove', (event) => {
                        let mouseX = event.offsetX;
                        let mouseY = event.offsetY;
                        // @TODO - BETA - Refactor to only re-draw the highlight area not the entire grid.
                        // highlightTile(mouseX, mouseY, data.tilewidth, data.tileheight, mapCanvasContext);
                        redrawWithHighlight(mapCanvasContext, mapCanvas.width, mapCanvas.height, data, mouseX, mouseY);
                    });
                }
                if(tileClickCallback){
                    mapCanvas.addEventListener('click', (event) => {
                        tileClickCallback(event, data);
                    });
                }
            })
            .catch(error => console.error('Error fetching JSON:', error));
    }

    function drawMap(mapCanvasContext, tileset, mapData)
    {
        // we are assuming there is only one tileset in mapData.tilesets since the maps are coming from the optimizer:
        let tilesetInfo = mapData.tilesets[0];
        let tileWidth = tilesetInfo.tilewidth;
        let tileHeight = tilesetInfo.tileheight;
        let margin = tilesetInfo.margin;
        let spacing = tilesetInfo.spacing;
        let columns = tilesetInfo.imagewidth / (tilesetInfo.tilewidth + tilesetInfo.spacing);
        for(let layer of mapData.layers){
            if('tilelayer' !== layer.type){
                continue;
            }
            let width = layer.width;
            for(let index = 0; index < layer.data.length; index++){
                let tileIndex = Number(layer.data[index]);
                if(0 === tileIndex){
                    continue;
                }
                let colIndex = index % width;
                let rowIndex = Math.floor(index / width);
                // adjusting for 0-based index:
                let tileId = tileIndex - 1;
                let sx = margin + (tileId % columns) * (tileWidth + spacing);
                let sy = margin + Math.floor(tileId / columns) * (tileHeight + spacing);
                mapCanvasContext.drawImage(
                    tileset,
                    sx,
                    sy,
                    tileWidth,
                    tileHeight,
                    colIndex * tileWidth,
                    rowIndex * tileHeight,
                    tileWidth,
                    tileHeight
                );
            }
        }
    }

    function drawTiles(canvasContext, canvasWidth, canvasHeight, tileWidth, tileHeight)
    {
        canvasContext.save();
        canvasContext.globalAlpha = 0.4;
        canvasContext.strokeStyle = '#ccc';
        canvasContext.lineWidth = 2;
        for(let x = 0; x < canvasWidth; x += tileWidth){
            for(let y = 0; y < canvasHeight; y += tileHeight){
                canvasContext.strokeRect(x, y, tileWidth, tileHeight);
            }
        }
        canvasContext.restore();
    }

    function highlightTile(mouseX, mouseY, tileWidth, tileHeight, canvasContext)
    {
        let tileCol = Math.floor(mouseX / tileWidth);
        let tileRow = Math.floor(mouseY / tileHeight);
        let highlightX = tileCol * tileWidth;
        let highlightY = tileRow * tileHeight;
        canvasContext.save();
        canvasContext.strokeStyle = 'red';
        canvasContext.lineWidth = 2;
        canvasContext.strokeRect(highlightX, highlightY, tileWidth, tileHeight);
        canvasContext.restore();
    }

    function redrawWithHighlight(mapCanvasContext, mapCanvasWidth, mapCanvasHeight, mapData, mouseX, mouseY)
    {
        drawTiles(mapCanvasContext, mapCanvasWidth, mapCanvasHeight, mapData.tilewidth, mapData.tileheight);
        highlightTile(mouseX, mouseY, mapData.tilewidth, mapData.tileheight, mapCanvasContext);
    }

    function loadAndCreateMap(mapJsonFileName, mapSceneImages, appendOnElement, tileClickCallback) {
        let mapCanvas = document.createElement('canvas');
        mapCanvas.classList.add('mapCanvas');
        appendOnElement.appendChild(mapCanvas);
        let sceneImages = mapSceneImages.split(',');
        if (1 === sceneImages.length) {
            let tileset = new Image();
            // for now, we will only handle 1 image cases:
            tileset.src = '/assets/maps/' + sceneImages[0];
            tileset.onload = () => {
                fetchMapFileAndDraw(
                    '/assets/maps/' + mapJsonFileName,
                    tileset,
                    mapCanvas,
                    true,
                    tileClickCallback
                );
            }
            tileset.onerror = () => {
                console.error('Error loading tileset image');
            };
        }
        if (1 < sceneImages.length) {
            console.error('Maps link is not available for tilesets with multiple images for now.');
        }
    }

    // error codes messages map:
    let errorMessages = {
        mapsWizardMissingActionError: 'Missing action.',
        mapsWizardMissingDataError: 'Missing data.',
        mapsWizardWrongJsonDataError: 'Invalid JSON data provided.',
        mapsWizardMissingHandlerError: 'Invalid or missing handler selected.'
    };

    // activate modals on click
    let modalElements = document.querySelectorAll('[data-toggle="modal"]');
    if(modalElements){
        for(let modalElement of modalElements){
            modalElement.addEventListener('click', () => {
                let overlay = document.createElement('div');
                overlay.classList.add('modal-overlay');
                let modal = document.createElement('div');
                modal.classList.add('modal');
                modal.classList.add('clickable');
                let clonedElement = cloneElement(modalElement);
                clonedElement.classList.add('clickable');
                modal.appendChild(clonedElement);
                overlay.appendChild(modal);
                document.body.appendChild(overlay);
                clonedElement.addEventListener('click', () => {
                    document.body.removeChild(overlay);
                });
                modal.addEventListener('click', (e) => {
                    if(e.target === modal){
                        document.body.removeChild(modal.parentNode);
                    }
                });
                overlay.addEventListener('click', (e) => {
                    if(e.target === overlay) {
                        document.body.removeChild(overlay);
                    }
                });
            });
        }
    }

    // forms behavior:
    let forms = document.querySelectorAll('form');
    if(forms){
        for(let form of forms){
            form.addEventListener('submit', (event) => {
                let submitButton = form.querySelector('input[type="submit"]');
                submitButton.disabled = true;
                let loadingImage = document.querySelector('.submit-container .loading');
                if(loadingImage){
                    loadingImage.classList.remove('hidden');
                }
            });
        }
    }

    // display notifications from query params:
    let notificationElement = document.querySelector('.notification');
    if(notificationElement){
        let closeNotificationElement = document.querySelector('.notification .close');
        closeNotificationElement?.addEventListener('click', () => {
            notificationElement.classList.remove('success', 'error');
        });
        let queryParams = new URLSearchParams(location.search);
        let result = queryParams.get('result');
        if(!result){
            result = getCookie('result');
        }
        let notificationMessageElement = document.querySelector('.notification .message');
        if(result && notificationMessageElement){
            let notificationClass = 'success' === result ? 'success' : 'error';
            notificationMessageElement.innerHTML = '';
            notificationElement.classList.add(notificationClass);
            notificationMessageElement.innerHTML = 'success' === result
                ? 'Success!'
                : 'There was an error: '+escapeHTML(errorMessages[result] || result);
            deleteCookie('result');
        }
    }

    // maps wizard functions:
    let mapsWizardsOptions = document.querySelectorAll('.maps-wizard-form .map-wizard-option.with-state');
    if(mapsWizardsOptions){
        for(let option of mapsWizardsOptions){
            option.addEventListener('click', (event) => {
                let wizardOptionsContainer = document.querySelectorAll('.wizard-option-container');
                for(let container of wizardOptionsContainer){
                    container.classList.remove('active');
                }
                event.currentTarget.parentNode.parentNode.classList.add('active');
            });
        }
    }

    // activate option on container click:
    let wizardOptions = document.querySelectorAll('.wizard-option-container');
    if(wizardOptions){
        for(let wizardOption of wizardOptions){
            wizardOption.addEventListener('click', function(){
                wizardOption.querySelector('input.map-wizard-option').click();
            });
        }
    }

    let mapCanvasElements = document.querySelectorAll('.mapCanvas');
    for(let mapCanvas of mapCanvasElements){
        if(!mapCanvas.dataset?.mapJson){
            continue;
        }
        let tileset = new Image();
        // for now, we will only handle 1 image cases:
        tileset.src = mapCanvas.dataset.imageKey;
        tileset.onload = () => {
            fetchMapFileAndDraw(mapCanvas.dataset.mapJson, tileset, mapCanvas);
        }
        tileset.onerror = () => {
            console.error('Error loading tileset image');
        };
    }

});
