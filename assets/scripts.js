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
    let configurationsState = {
        'elements-object-loader': JSON.stringify({
            tileSize: 32,
            tileSheetPath: 'tilesheet.png',
            tileSheetName: 'tilesheet.png',
            imageHeight: 578,
            imageWidth: 612,
            tileCount: 306,
            columns: 18,
            margin: 1,
            spacing: 2,
            elementsQuantity: {
                house1: 3,
                house2: 2,
                tree: 6
            },
            groundTile: 116,
            mainPathSize: 3,
            blockMapBorder: true,
            freeSpaceTilesQuantity: 2,
            variableTilesPercentage: 15.0,
            pathTile: 121,
            collisionLayersForPaths: ['change-points', 'collisions', 'tree-base'],
            randomGroundTiles: [26, 27, 28, 29, 30, 36, 37, 38, 39, 50, 51, 52, 53],
            surroundingTiles: {
                '-1,-1': 127,
                '-1,0': 124,
                '-1,1': 130,
                '0,-1': 126,
                '0,1': 129,
                '1,-1': 132,
                '1,0': 131,
                '1,1': 133
            },
            corners: {
                '-1,-1': 285,
                '-1,1': 284,
                '1,-1': 283,
                '1,1': 282
            },
            layerElementsFiles: {
                house1: 'house-001.json',
                house2: 'house-002.json',
                tree: 'tree.json'
            }
        }),
        'elements-composite-loader': JSON.stringify({
            factor: 2,
            mainPathSize: 3,
            blockMapBorder: true,
            freeSpaceTilesQuantity: 2,
            variableTilesPercentage: 15,
            collisionLayersForPaths: ['change-points', 'collisions', 'tree-base'],
            compositeElementsFile: 'reldens-town-composite.json',
            automaticallyExtrudeMaps: '1'
        }),
        'multiple-by-loader': JSON.stringify({
            factor: 2,
            mainPathSize: 3,
            blockMapBorder: true,
            freeSpaceTilesQuantity: 2,
            variableTilesPercentage: 15,
            collisionLayersForPaths: ['change-points', 'collisions', 'tree-base'],
            mapNames: ['map-001', 'map-002', 'map-003'],
            compositeElementsFile: 'reldens-town-composite.json',
            automaticallyExtrudeMaps: '1'
        }),
        'multiple-with-association-by-loader': JSON.stringify({
            factor: 2,
            mainPathSize: 3,
            blockMapBorder: true,
            freeSpaceTilesQuantity: 2,
            variableTilesPercentage: 15,
            collisionLayersForPaths: ['change-points', 'collisions', 'tree-base'],
            mapsInformation: [
                {mapName: 'town-001', mapTitle: 'Town 1'},
                {mapName: 'town-002', mapTitle: 'Town 2'},
                {mapName: 'town-003', mapTitle: 'Town 3'},
                {mapName: 'town-004', mapTitle: 'Town 4'}
            ],
            associationsProperties: {
                generateElementsPath: false,
                blockMapBorder: true,
                freeSpaceTilesQuantity: 0,
                variableTilesPercentage: 0,
                placeElementsOrder: 'inOrder',
                orderElementsBySize: false,
                randomizeQuantities: true,
                applySurroundingPathTiles: false,
                automaticallyExtrudeMaps: true
            },
            compositeElementsFile: 'reldens-town-composite-with-associations.json',
            automaticallyExtrudeMaps: '1'
        })
    };

    let mapsWizardsOptions = document.querySelectorAll('.maps-wizard-form .map-wizard-option.with-state');
    if(mapsWizardsOptions){
        for(let option of mapsWizardsOptions){
            option.addEventListener('change', (event) => {
                let wizardOptionsContainer = document.querySelectorAll('.wizard-option-container');
                for(let container of wizardOptionsContainer){
                    container.classList.remove('active');
                }
                event.currentTarget.parentNode.parentNode.classList.add('active');
                updateGeneratorDataFromInputs();
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

    let configInputs = document.querySelectorAll('.config-input');
    if(configInputs){
        for(let input of configInputs){
            input.addEventListener('change', () => {
                updateConfigValue(input);
            });
        }
    }

    let selectedOption = getSelectedOption();
    if(selectedOption){
        updateGeneratorDataFromInputs(selectedOption);
    }

    function getSelectedOption()
    {
        let selectedOption = document.querySelector('input[name="mapsWizardAction"]:checked');
        if(!selectedOption){
            return '';
        }
        return selectedOption.value;
    }

    function processInputValue(input, propertyName, propertyValue)
    {
        if('SELECT' === input.tagName && ('true' === propertyValue || 'false' === propertyValue)){
            return 'true' === propertyValue;
        }
        if(input.type === 'number'){
            return Number(propertyValue);
        }
        if(input.tagName === 'TEXTAREA'){
            try{
                return JSON.parse(propertyValue);
            } catch(e){
                console.error('Invalid JSON value for ' + propertyName);
                return propertyValue;
            }
        }
        if(
            propertyName === 'collisionLayersForPaths'
            || propertyName === 'mapNames'
            || propertyName === 'randomGroundTiles'
        ){
            if(typeof propertyValue === 'string'){
                let values = propertyValue.split(',').map(item => item.trim());
                if(propertyName === 'randomGroundTiles'){
                    return values.map(item => Number(item));
                }
                return values;
            }
        }
        return propertyValue;
    }

    function updateConfigValue(input)
    {
        let propertyName = input.dataset.property;
        let propertyValue = processInputValue(input, propertyName, input.value);
        let generatorDataElement = document.querySelector('#generatorData');
        let currentData = {};
        try{
            currentData = JSON.parse(generatorDataElement.value || '{}');
        } catch(e){
            currentData = {};
        }
        currentData[propertyName] = propertyValue;
        generatorDataElement.value = JSON.stringify(currentData, null, 2);
    }

    function updateGeneratorDataFromInputs(optionType)
    {
        if(!optionType){
            optionType = getSelectedOption();
        }
        if(!optionType){
            return;
        }
        let inputs = document.querySelectorAll('.config-input[data-option="' + optionType + '"]');
        let generatorDataElement = document.querySelector('#generatorData');
        let generatorData = JSON.parse(configurationsState[optionType]);
        for(let input of inputs){
            let propertyName = input.dataset.property;
            generatorData[propertyName] = processInputValue(input, propertyName, input.value);
        }
        generatorDataElement.value = JSON.stringify(generatorData, null, 2);
    }

    function setInputValue(input, propertyName, propertyValue)
    {
        if(input.tagName === 'SELECT'){
            input.value = propertyValue.toString();
            return;
        }
        if(input.tagName === 'TEXTAREA'){
            if(typeof propertyValue === 'object'){
                input.value = JSON.stringify(propertyValue, null, 2);
                return;
            }
            input.value = propertyValue;
            return;
        }
        if(input.type === 'number'){
            input.value = propertyValue;
            return;
        }
        if(
            Array.isArray(propertyValue)
            && (
                propertyName === 'collisionLayersForPaths'
                || propertyName === 'mapNames'
                || propertyName === 'randomGroundTiles'
            )
        ){
            input.value = propertyValue.join(',');
            return;
        }
        input.value = propertyValue;
    }

    function updateInputsFromGeneratorData()
    {
        let generatorDataElement = document.querySelector('#generatorData');
        let optionType = getSelectedOption();
        if(!generatorDataElement.value || !optionType){
            return;
        }
        try{
            let jsonData = JSON.parse(generatorDataElement.value);
            for(let propertyName in jsonData){
                let propertyValue = jsonData[propertyName];
                let inputSelector = '.config-input[data-option="'+optionType+'"][data-property="'+propertyName+'"]';
                let input = document.querySelector(inputSelector);
                if(input){
                    setInputValue(input, propertyName, propertyValue);
                }
            }
            configurationsState[optionType] = generatorDataElement.value;
        } catch(e){
            // console.error('Error parsing generator data JSON: ', e);
        }
    }

    let generatorDataElement = document.querySelector('#generatorData');
    if(generatorDataElement){
        generatorDataElement.addEventListener('input', () => {
            updateInputsFromGeneratorData();
        });
    }

    let configTitles = document.querySelectorAll('.config-container h4');
    if(configTitles){
        for(let title of configTitles){
            title.classList.add('clickable');
            title.addEventListener('click', () => {
                let container = title.closest('.config-container');
                if(container){
                    container.classList.toggle('active');
                }
            });
        }
    }

    let options = document.querySelectorAll('.set-sample-data');
    if(generatorDataElement){
        for(let option of options){
            option.addEventListener('click', () => {
                generatorDataElement.value = configurationsState[option.dataset.optionValue] || '';
                updateGeneratorDataFromInputs();
                configurationsState[option.dataset.optionValue] = generatorDataElement.value;
            });
        }
    }

});
