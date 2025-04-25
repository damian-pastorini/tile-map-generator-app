/**
 *
 * Reldens - MapsWizardManager
 *
 */

const TemplateEngineRender = require('mustache');
const {
    RandomMapGenerator,
    LayerElementsObjectLoader,
    LayerElementsCompositeLoader,
    MultipleByLoaderGenerator,
    MultipleWithAssociationsByLoaderGenerator
} = require('@reldens/tile-map-generator');
const { UploaderFactory, FileHandler } = require('@reldens/server-utils');
const { Logger, sc } = require('@reldens/utils');

class MapsWizardManager
{

    constructor(projectRoot)
    {
        this.projectRoot = projectRoot;
        this.mapsWizardPath = 'maps-wizard';
        this.rootPath = '/';
        this.fields = [
            {name: 'generatorImages'},
            {name: 'generatorJsonFiles'}
        ];
        this.templates = {
            layout: FileHandler.joinPaths(this.projectRoot, 'templates', 'layout.html'),
            mapsWizard: FileHandler.joinPaths(this.projectRoot, 'templates', 'maps-wizard.html'),
            mapsWizardSelection: FileHandler.joinPaths(this.projectRoot, 'templates', 'maps-wizard-maps-selection.html')
        };
        this.generateDataPath = FileHandler.joinPaths(this.projectRoot, 'generate-data');
        this.generatedDataPath = FileHandler.joinPaths(this.projectRoot, 'generated');
        this.buckets = {
            generatorImages: this.generateDataPath,
            generatorJsonFiles: this.generateDataPath
        };
        this.allowedFileTypes = {
            generatorImages: 'image',
            generatorJsonFiles: 'text'
        };
        this.uploaderFactory = new UploaderFactory({
            mimeTypes: {
                image: [
                    'image/bmp',
                    'image/gif',
                    'image/jpeg',
                    'image/png',
                    'image/svg+xml',
                    'image/vnd.microsoft.icon',
                    'image/tiff',
                    'image/webp'
                ],
                text: [
                    'application/json',
                    'application/ld+json',
                    'text/plain',
                ]
            },
            allowedExtensions: {
                image: ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp'],
                text: ['.json', '.txt', '.tmj']
            }
        });
        this.uploader = this.uploaderFactory.createUploader(this.fields, this.buckets, this.allowedFileTypes);
        this.mapsWizardHandlers = {
            'elements-object-loader': LayerElementsObjectLoader,
            'elements-composite-loader': LayerElementsCompositeLoader,
            'multiple-by-loader': MultipleByLoaderGenerator,
            'multiple-with-association-by-loader': MultipleWithAssociationsByLoaderGenerator
        };
        this.contents = {};
        this.maxMapSize = 5000000;
        this.maxJsonSize = 1024 * 1024;
    }

    async setupContents()
    {
        this.contents['mapsWizard'] = await this.renderRoute(
            await this.render(
                await FileHandler.fetchFileContents(this.templates.mapsWizard),
                {actionPath: this.rootPath + this.mapsWizardPath}
            )
        );
    }

    async render(content, params)
    {
        return await TemplateEngineRender.render(content, params);
    }

    async renderRoute(pageContent)
    {
        return await this.render(
            await FileHandler.fetchFileContents(this.templates.layout),
            {
                pageContent,
                rootPath: this.rootPath,
                brandingCompanyName: '<span class="reldens">Reldens</span> - Tile Map Generator',
                copyRight: '&copy;'+(new Date()).getFullYear()
                    +' <a href="https://www.dwdeveloper.com/" target="_blank">DwDeveloper</a>'
            }
        );
    }

    setupRoutes(router, rateLimiter)
    {
        router.get(this.rootPath+this.mapsWizardPath, async (req, res) => {
            return res.send(this.contents['mapsWizard']);
        });
        router.post(
            this.rootPath+this.mapsWizardPath,
            rateLimiter,
            this.uploader,
            async (req, res) => {
                if('generate' === req?.body?.mainAction){
                    return await this.generateMaps(req, res);
                }
                return res.redirect(this.rootPath);
            }
        );
    }

    async generateMaps(req, res)
    {
        let selectedHandler = req?.body?.mapsWizardAction;
        if(!selectedHandler || typeof selectedHandler !== 'string'){
            return this.mapsWizardRedirect(res, 'mapsWizardMissingActionError');
        }
        if(!sc.hasOwn(this.mapsWizardHandlers, selectedHandler)){
            return this.mapsWizardRedirect(res, 'mapsWizardMissingHandlerError');
        }
        let generatorData = req?.body?.generatorData;
        if(!generatorData){
            return this.mapsWizardRedirect(res, 'mapsWizardMissingDataError');
        }
        if(typeof generatorData === 'string' && generatorData.length > this.maxJsonSize){
            return this.mapsWizardRedirect(res, 'mapsWizardDataTooLargeError');
        }
        let mapData;
        try {
            if(typeof generatorData === 'string'){
                mapData = JSON.parse(generatorData);
            } else {
                Logger.error('Generator data must be a string');
                return this.mapsWizardRedirect(res, 'mapsWizardWrongJsonDataError');
            }
        } catch(error){
            Logger.error('Invalid JSON data provided.', error);
            return this.mapsWizardRedirect(res, 'mapsWizardWrongJsonDataError');
        }
        if(!this.validateMapData(mapData)){
            return this.mapsWizardRedirect(res, 'mapsWizardInvalidDataError');
        }
        let handler = this.mapsWizardHandlers[selectedHandler];
        let mainGenerator = false;
        let generatorWithData = false;
        let generatedMap = false;
        let handlerParams = {
            mapData,
            rootFolder: this.generateDataPath,
            generatedFolder: this.generatedDataPath
        };
        try {
            if('elements-object-loader' === selectedHandler){
                mainGenerator = new handler(handlerParams);
                await mainGenerator.load();
                let generator = new RandomMapGenerator(mainGenerator.mapData);
                generatedMap = await generator.generate();
                generatorWithData = generator;
            }
            if('elements-composite-loader' === selectedHandler){
                mainGenerator = new handler(handlerParams);
                await mainGenerator.load();
                let generator = new RandomMapGenerator();
                await generator.fromElementsProvider(mainGenerator.mapData);
                generatedMap = await generator.generate();
                generatorWithData = generator;
            }
            if('multiple-by-loader' === selectedHandler){
                mainGenerator = new MultipleByLoaderGenerator({loaderData: handlerParams});
                await mainGenerator.generate();
                generatorWithData = mainGenerator;
            }
            if('multiple-with-association-by-loader' === selectedHandler){
                mainGenerator = new MultipleWithAssociationsByLoaderGenerator({loaderData: handlerParams});
                await mainGenerator.generate();
                generatorWithData = mainGenerator;
            }
        } catch (error) {
            Logger.error('Maps generator error.', selectedHandler, generatorData, error);
            return this.mapsWizardRedirect(res, 'mapsWizardGeneratorError');
        }
        if(!generatorWithData){
            Logger.error('Maps not generated, incompatible selected handler.', selectedHandler, generatorData);
            return this.mapsWizardRedirect(res, 'mapsWizardSelectedHandlerError');
        }
        let mapsData = {
            maps: [],
            actionPath: this.rootPath+this.mapsWizardPath,
            generatedMapsHandler: selectedHandler,
            importAssociationsForChangePoints: Number(mapData.importAssociationsForChangePoints || 0),
            importAssociationsRecursively: Number(mapData.importAssociationsRecursively || 0),
            verifyTilesetImage: Number(mapData.verifyTilesetImage || 1),
            automaticallyExtrudeMaps: Number(mapData.automaticallyExtrudeMaps || 1),
            handlerParams: generatorData
        };
        if(generatedMap){
            let tileWidth = parseInt(generatedMap.tilewidth) || 0;
            let tileHeight = parseInt(generatedMap.tileheight) || 0;
            if(0 >= tileWidth || 1000 < tileWidth || 0 >= tileHeight || 1000 < tileHeight){
                Logger.error('Invalid tile dimensions', {tileWidth, tileHeight});
                return this.mapsWizardRedirect(res, 'mapsWizardInvalidDimensionsError');
            }
            let mapWidth = parseInt(generatedMap.width) || 0;
            let mapHeight = parseInt(generatedMap.height) || 0;
            if(0 >= mapWidth || 1000 < mapWidth || 0 >= mapHeight || 1000 < mapHeight){
                Logger.error('Invalid map dimensions', {mapWidth, mapHeight});
                return this.mapsWizardRedirect(res, 'mapsWizardInvalidDimensionsError');
            }
            let totalSize = mapWidth * tileWidth * mapHeight * tileHeight;
            if(this.maxMapSize < totalSize){
                Logger.error('Map size exceeds maximum allowed', {totalSize, maxSize: this.maxMapSize});
                return this.mapsWizardRedirect(res, 'mapsWizardSizeExceededError');
            }
            let mapFileName = FileHandler.sanitizePath(generatorWithData.mapFileName || '');
            if(-1 === mapFileName.indexOf('json')){
                mapFileName = mapFileName+'.json';
            }
            if(!mapFileName || '.json' === mapFileName){
                mapFileName = 'map_' + Date.now() + '.json';
            }
            let tileSheetName = FileHandler.sanitizePath(generatorWithData.tileSheetName || '');
            if(!tileSheetName){
                tileSheetName = 'tileset_' + Date.now() + '.png';
            }
            mapsData.maps.push({
                key: FileHandler.sanitizePath(generatorWithData.mapName || 'unnamed_map'),
                mapWidth: mapWidth * tileWidth,
                mapHeight: mapHeight * tileHeight,
                tileWidth,
                tileHeight,
                mapImage: this.rootPath+'generated/'+tileSheetName,
                mapJson: this.rootPath+'generated/'+mapFileName
            });
        }
        if(generatorWithData.generators && generatorWithData.generatedMaps){
            for(let i of Object.keys(generatorWithData.generators)){
                let generator = generatorWithData.generators[i];
                let generatedMap = generatorWithData.generatedMaps[generator.mapName];
                if(!generatedMap){
                    continue;
                }
                let tileWidth = parseInt(generatedMap.tilewidth) || 0;
                let tileHeight = parseInt(generatedMap.tileheight) || 0;
                if(0 >= tileWidth || 1000 < tileWidth || 0 >= tileHeight || 1000 < tileHeight){
                    continue;
                }
                let mapWidth = parseInt(generatedMap.width) || 0;
                let mapHeight = parseInt(generatedMap.height) || 0;
                if(0 >= mapWidth || 1000 < mapWidth || 0 >= mapHeight || 1000 < mapHeight){
                    continue;
                }
                let totalSize = mapWidth * tileWidth * mapHeight * tileHeight;
                if(this.maxMapSize < totalSize){
                    continue;
                }
                let mapFileName = FileHandler.sanitizePath(generator.mapFileName || '');
                if(-1 === mapFileName.indexOf('json')){
                    mapFileName = mapFileName+'.json';
                }
                if(!mapFileName || '.json' === mapFileName){
                    mapFileName = 'map_' + Date.now() + '_' + i + '.json';
                }
                let tileSheetName = FileHandler.sanitizePath(generator.tileSheetName || '');
                if(!tileSheetName){
                    tileSheetName = 'tileset_' + Date.now() + '_' + i + '.png';
                }
                let associatedMap = sc.get(mainGenerator.associatedMaps, i, {});
                let subMaps = this.mapSubMapsData(
                    sc.get(associatedMap, 'generatedSubMaps'),
                    sc.get(associatedMap, 'generators'),
                    tileWidth,
                    tileHeight
                );
                mapsData.maps.push({
                    key: FileHandler.sanitizePath(generator.mapName || 'unnamed_map_' + i),
                    mapWidth: mapWidth * tileWidth,
                    mapHeight: mapHeight * tileHeight,
                    tileWidth,
                    tileHeight,
                    mapImage: this.rootPath+'generated/'+tileSheetName,
                    mapJson: this.rootPath+'generated/'+mapFileName,
                    hasSubMaps: 0 < subMaps.length,
                    subMaps
                });
            }
        }
        if(0 === mapsData.maps.length){
            return this.mapsWizardRedirect(res, 'mapsWizardMapsNotGeneratedError');
        }
        return res.send(
            await this.renderRoute(
                await this.render(await FileHandler.fetchFileContents(this.templates.mapsWizardSelection), mapsData)
            )
        );
    }

    validateMapData(mapData)
    {
        if(!mapData){
            Logger.error('Missing map data.', mapData);
            return false;
        }
        if('object' !== typeof mapData || Array.isArray(mapData)){
            Logger.error('Map data is not an object.', mapData);
            return false;
        }
        if(mapData.width && mapData.height){
            if(isNaN(mapData.width) || isNaN(mapData.height)){
                Logger.error('Missing map width or height.', mapData.width, mapData.height);
                return false;
            }
            let width = Number(mapData.width);
            let height = Number(mapData.height);
            if(0 >= width || 0 >= height){
                Logger.error('Invalid map width or height.', mapData.width, mapData.height);
                return false;
            }
            if(this.maxMapSize < width * height){
                Logger.error('Invalid map max size.', width * height, this.maxMapSize);
                return false;
            }
        }
        return true;
    }

    mapSubMapsData(generatedSubMaps, generators, tileWidth, tileHeight)
    {
        if(!generatedSubMaps){
            return [];
        }
        let subMapsData = [];
        for(let i of Object.keys(generatedSubMaps)){
            let subMapData = generatedSubMaps[i];
            let generator = generators[i];
            if(!subMapData || !generator){
                continue;
            }
            let mapWidth = parseInt(subMapData.width) || 0;
            let mapHeight = parseInt(subMapData.height) || 0;
            if(0 >= mapWidth || 1000 < mapWidth || 0 >= mapHeight || 1000 < mapHeight){
                continue;
            }
            let totalSize = mapWidth * tileWidth * mapHeight * tileHeight;
            if(this.maxMapSize < totalSize){
                continue;
            }
            let mapFileName = FileHandler.sanitizePath(generator.mapFileName || '');
            if(-1 === mapFileName.indexOf('json')){
                mapFileName = mapFileName+'.json';
            }
            if(!mapFileName || '.json' === mapFileName){
                mapFileName = 'map_' + Date.now() + '_sub_' + i + '.json';
            }
            let tileSheetName = FileHandler.sanitizePath(generator.tileSheetName || '');
            if(!tileSheetName){
                tileSheetName = 'tileset_' + Date.now() + '_sub_' + i + '.png';
            }
            subMapsData.push({
                key: FileHandler.sanitizePath(generator.mapName || 'unnamed_submap_' + i),
                mapWidth: mapWidth * tileWidth,
                mapHeight: mapHeight * tileHeight,
                tileWidth,
                tileHeight,
                mapImage: this.rootPath+'generated/'+tileSheetName,
                mapJson: this.rootPath+'generated/'+mapFileName
            });
        }
        return subMapsData;
    }

    mapsWizardRedirect(res, result)
    {
        return res.redirect(this.rootPath + this.mapsWizardPath + '?result='+result);
    }
}

module.exports.MapsWizardManager = MapsWizardManager;
