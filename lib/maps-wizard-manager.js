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

    setupRoutes(router)
    {
        router.get(this.rootPath+this.mapsWizardPath, async (req, res) => {
            return res.send(this.contents['mapsWizard']);
        });
        router.post(
            this.rootPath+this.mapsWizardPath,
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
        if(!selectedHandler){
            return this.mapsWizardRedirect(res, 'mapsWizardMissingActionError');
        }
        let generatorData = req?.body?.generatorData;
        if(!generatorData){
            return this.mapsWizardRedirect(res, 'mapsWizardMissingDataError');
        }
        let mapData = sc.toJson(generatorData);
        if(!mapData){
            return this.mapsWizardRedirect(res, 'mapsWizardWrongJsonDataError');
        }
        let handler = this.mapsWizardHandlers[selectedHandler];
        if(!handler){
            return this.mapsWizardRedirect(res, 'mapsWizardMissingHandlerError');
        }
        let mainGenerator = false;
        let generatorWithData = false;
        let generatedMap = false;
        let handlerParams = {mapData, rootFolder: this.generateDataPath, generatedFolder: this.generatedDataPath};
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
            let tileWidth = generatedMap.tilewidth;
            let tileHeight = generatedMap.tileheight;
            let mapFileName = generatorWithData.mapFileName;
            if(-1 === mapFileName.indexOf('json')){
                mapFileName = mapFileName+'.json';
            }
            mapsData.maps.push({
                key: generatorWithData.mapName,
                mapWidth: generatedMap.width * tileWidth,
                mapHeight: generatedMap.height * tileHeight,
                tileWidth,
                tileHeight,
                mapImage: this.rootPath+'generated/'+generatorWithData.tileSheetName,
                mapJson: this.rootPath+'generated/'+mapFileName
            });
        }
        if(generatorWithData.generators && generatorWithData.generatedMaps){
            for(let i of Object.keys(generatorWithData.generators)){
                let generator = generatorWithData.generators[i];
                let generatedMap = generatorWithData.generatedMaps[generator.mapName];
                let tileWidth = generatedMap.tilewidth;
                let tileHeight = generatedMap.tileheight;
                let mapFileName = generator.mapFileName;
                if(-1 === mapFileName.indexOf('json')){
                    mapFileName = mapFileName+'.json';
                }
                let associatedMap = sc.get(mainGenerator.associatedMaps, i, {});
                let subMaps = this.mapSubMapsData(
                    sc.get(associatedMap, 'generatedSubMaps'),
                    sc.get(associatedMap, 'generators'),
                    tileWidth,
                    tileHeight
                );
                mapsData.maps.push({
                    key: generator.mapName,
                    mapWidth: generatedMap.width * tileWidth,
                    mapHeight: generatedMap.height * tileHeight,
                    tileWidth,
                    tileHeight,
                    mapImage: this.rootPath+'generated/'+generator.tileSheetName,
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

    mapSubMapsData(generatedSubMaps, generators, tileWidth, tileHeight)
    {
        if(!generatedSubMaps){
            return [];
        }
        let subMapsData = [];
        for(let i of Object.keys(generatedSubMaps)) {
            let subMapData = generatedSubMaps[i];
            let generator = generators[i];
            let mapFileName = generator.mapFileName;
            if(-1 === mapFileName.indexOf('json')){
                mapFileName = mapFileName+'.json';
            }
            subMapsData.push({
                key: generator.mapName,
                mapWidth: subMapData.width * tileWidth,
                mapHeight: subMapData.height * tileHeight,
                tileWidth,
                tileHeight,
                mapImage: this.rootPath+'generated/'+generator.tileSheetName,
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
