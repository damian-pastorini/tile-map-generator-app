/**
 *
 * Reldens - Tile Map Generator App
 *
 */

const { MapsWizardManager } = require('./lib/maps-wizard-manager');
const { AppServerFactory, FileHandler } = require('@reldens/server-utils');

class ReldensTileMapGeneratorApp
{

    constructor()
    {
        this.projectRoot = __dirname;
        this.generateDataFilesFolder = FileHandler.joinPaths(this.projectRoot, 'generate-data');
        this.generatedFilesFolder = FileHandler.joinPaths(this.projectRoot, 'generated');
        this.appServerFactory = new AppServerFactory();
        let createServerResult = this.appServerFactory.createAppServer();
        this.app = createServerResult.app;
        this.appServer = createServerResult.appServer;
        this.mapsWizardManager = new MapsWizardManager(this.projectRoot);
    }

    async start()
    {
        await this.appServerFactory.serveStaticsPath(this.app, '/assets', 'assets');
        await this.appServerFactory.serveStaticsPath(this.app, '/generated', 'generated');
        await this.mapsWizardManager.setupContents();
        await this.appServerFactory.enableServeHome(this.app, async () => {
            return this.mapsWizardManager.contents['mapsWizard'];
        });
        await this.mapsWizardManager.setupRoutes(this.app);
        await this.appServer.listen(8080);
        this.activateFilesRemoval();
    }

    activateFilesRemoval()
    {
        let timeout = 60 * 60 * 1000; // 1h
        this.removeTemporalFilesTimer = setTimeout(() => {
            let generateDataFiles = FileHandler.readFolder(this.generateDataFilesFolder);
            console.log('Found generate data files: ' + generateDataFiles.length);
            this.removeTemporalFiles(generateDataFiles, this.generateDataFilesFolder);
            let generatedFiles = FileHandler.readFolder(this.generatedFilesFolder);
            console.log('Found generated files: ' + generatedFiles.length);
            this.removeTemporalFiles(generatedFiles, this.generatedFilesFolder);
        }, timeout)
    }

    removeTemporalFiles(files, folder)
    {
        for(let file of files){
            if(-1 === file.indexOf('.png') && -1 === file.indexOf('.json')){
                if ('.gitkeep' !== file) {
                    console.log('Invalid file found.');
                }

                continue;
            }
            let filePath = FileHandler.joinPaths(folder, file);
            if(!FileHandler.isFile(filePath)){
                continue;
            }

            FileHandler.remove(filePath);
            console.log('Removed file "'+file+'".');
        }
    }
}

const tileMapGeneratorApp = new ReldensTileMapGeneratorApp();

tileMapGeneratorApp.start().then(() => {
    console.log('Reldens - Tile Map Generator App - Started');
    console.log('Listening at http://localhost:8080');
}).catch((error) => {
    console.error(error);
});
