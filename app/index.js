'use strict';
var fs = require('fs');
var path = require('path');
var util = require('util');
var angularUtils = require('../util.js');
var yeoman = require('yeoman-generator');
var yosay = require('yosay');
var wiredep = require('wiredep');
var chalk = require('chalk');
var bower = require('bower');
var inquirer = require('inquirer');

var progressIcon = {
    _interval: null,
    start: function (message) {
        clearInterval(this.interval);
        var progressSequence = [
                'Oooooooooo',
                'oOoooooooo',
                'ooOooooooo',
                'oooOoooooo',
                'ooooOooooo',
                'oooooOoooo',
                'ooooooOooo',
                'oooooooOoo',
                'ooooooooOo',
                'oooooooooO',
                'oooooooooO',
                'ooooooooOo',
                'oooooooOoo',
                'ooooooOooo',
                'oooooOoooo',
                'ooooOooooo',
                'oooOoooooo',
                'ooOooooooo',
                'oOoooooooo',
                'Oooooooooo'
            ],
            currStep = 0;

        if (message) {
            message = '  ' + message + ' ';
        } else {
            message = '  ';
        }

        this.interval = setInterval(function () {
            if (currStep == progressSequence.length) {
                currStep = 0;
            }
            process.stdout.clearLine();
            process.stdout.cursorTo(0);
            process.stdout.write(chalk.bgCyan(message + chalk.bold(progressSequence[currStep])));
            process.stdout.cursorTo(0);
            currStep++;
        }.bind(this), 50);
    },
    stop: function () {
        clearInterval(this.interval);
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
    }
};

var Generator = module.exports = function Generator(args, options) {
    yeoman.generators.Base.apply(this, arguments);
    this.argument('appname', { type: String, required: false });
    this.appname = this.appname || path.basename(process.cwd());
    this.appname = this._.camelize(this._.slugify(this._.humanize(this.appname)));

    this.option('app-suffix', {
        desc: 'Allow a custom suffix to be added to the module name',
        type: String,
        required: 'false'
    });
    this.env.options['app-suffix'] = this.options['app-suffix'];
    this.scriptAppName = this.appname + angularUtils.appName(this);

    args = ['main'];

    if (typeof this.env.options.appPath === 'undefined') {
        this.option('appPath', {
            desc: 'Generate CoffeeScript instead of JavaScript'
        });

        this.env.options.appPath = this.options.appPath;

        if (!this.env.options.appPath) {
            try {
                this.env.options.appPath = require(path.join(process.cwd(), 'bower.json')).appPath;
            } catch (e) {
            }
        }
        this.env.options.appPath = this.env.options.appPath || 'app';
        this.options.appPath = this.env.options.appPath;
    }

    this.appPath = this.env.options.appPath;

    if (typeof this.env.options.coffee === 'undefined') {
        this.option('coffee', {
            desc: 'Generate CoffeeScript instead of JavaScript'
        });

        // attempt to detect if user is using CS or not
        // if cml arg provided, use that; else look for the existence of cs
        if (!this.options.coffee &&
            this.expandFiles(path.join(this.appPath, '/scripts/**/*.coffee'), {}).length > 0) {
            this.options.coffee = true;
        }

        this.env.options.coffee = this.options.coffee;
    }

    this.hookFor('angular:common', {
        args: args
    });

    this.hookFor('angular:main', {
        args: args
    });

    this.hookFor('angular:controller', {
        args: args
    });

    this.bowerComponents = [];

    this.nodeModules = [];

    this.on('end', function () {
        var enabledComponents = [];

        if (this.animateModule) {
            enabledComponents.push('angular-animate/angular-animate.js');
        }

        if (this.cookiesModule) {
            enabledComponents.push('angular-cookies/angular-cookies.js');
        }

        if (this.resourceModule) {
            enabledComponents.push('angular-resource/angular-resource.js');
        }

        if (this.routeModule) {
            enabledComponents.push('angular-route/angular-route.js');
        }

        if (this.sanitizeModule) {
            enabledComponents.push('angular-sanitize/angular-sanitize.js');
        }

        if (this.touchModule) {
            enabledComponents.push('angular-touch/angular-touch.js');
        }

        enabledComponents = [
            'angular/angular.js',
            'angular-mocks/angular-mocks.js'
        ].concat(enabledComponents).join(',');

        var jsExt = this.options.coffee ? 'coffee' : 'js';

        var invokeKarma = function invokeKarma(bowerComponentInformations) {
            bowerComponentInformations || (bowerComponentInformations = []);

            var bowerComponents = bowerComponentInformations.map(function (componentInfo) {
                return componentInfo.file;
            }).join(',');

            this.invoke('karma:app', {
                options: {
                    'skip-install': this.options['skip-install'],
                    'base-path': '../',
                    'coffee': this.options.coffee,
                    'travis': true,
                    'bower-components': [bowerComponents, enabledComponents].join(','),
                    'app-files': 'app/scripts/**/*.' + jsExt,
                    'test-files': [
                            'test/mock/**/*.' + jsExt,
                            'test/spec/**/*.' + jsExt
                    ].join(','),
                    'bower-components-path': 'bower_components',
                    'plugins': [
                        'karma-chrome-launcher',
                        'karma-firefox-launcher',
                        'karma-safari-launcher',
                        'karma-phantomjs-launcher',
                        'karma-jasmine'
                    ].join(',')
                }
            });
        }.bind(this);

        var installDependencies = function installDependencies() {
            this.installDependencies({
                skipInstall: this.options['skip-install'],
                skipMessage: this.options['skip-message'],
                callback: this._injectDependencies.bind(this)
            });
        }.bind(this);

        var createAboutRoute = function createAboutRoute() {
            if (this.env.options.ngRoute) {
                this.invoke('angular:route', {
                    args: ['about']
                });
            }
        }.bind(this);


        if (this.bowerComponents.length) {
            var bowerModuleInformations = [],
                receivedInfoCunt = 0;

            progressIcon.start();
            this.bowerComponents.map(function (module) {
                bower.commands.info(module).on('end', function (result) {
                    bowerModuleInformations.push({
                        name: module,
                        version: result.latest.version,
                        // @todo: kann auch Array sein (angular-material: .js & .css)!!!
                        file: result.latest.main.substr(2)
                    });

                    receivedInfoCunt++;

                    if (receivedInfoCunt === this.bowerComponents.length) {
                        progressIcon.stop();
                        invokeKarma(bowerModuleInformations);
                        installDependencies();
                        createAboutRoute();
                    }
                }.bind(this));
            }, this);
        } else {
            invokeKarma();
            installDependencies();
            createAboutRoute();
        }
    });

    this.pkg = require('../package.json');
    this.sourceRoot(path.join(__dirname, '../templates/common'));
};

util.inherits(Generator, yeoman.generators.Base);

Generator.prototype.welcome = function welcome() {
    if (!this.options['skip-welcome-message']) {
        this.log(yosay());
        this.log(
            chalk.magenta(
                    'Out of the box I include Bootstrap and some AngularJS recommended modules.' +
                    '\n'
            )
        );
    }

    if (this.options.minsafe) {
        this.log.error(
                'The --minsafe flag has been removed. For more information, see' +
                '\nhttps://github.com/yeoman/generator-angular#minification-safe.' +
                '\n'
        );
    }
};

Generator.prototype.askForAngularVersion = function askForAngularVersion() {
    var cb = this.async();

    progressIcon.start('Fetching AngularJS versions');
    bower.commands
        .info('angular')
        .on('end', function (results) {
            progressIcon.stop();
            this.prompt([{
                type: 'list',
                name: 'angularVersion',
                message: 'Choose angular version:',
                default: 0,
                choices: [
                    new inquirer.Separator(),
                    {
                        name: 'Latest AngularJS version: ' + chalk.bold(results.latest.version),
                        value: results.latest.version
                    },
                    new inquirer.Separator()
                ].concat(results.versions.filter(function (version) {
                        return !version.match('build');
                    }).map(function(version) {
                        return {
                            name: version,
                            value: version
                        };
                    }))
            }], function (props) {
                this.angularVersion = props.angularVersion;
                cb();
            }.bind(this));
        }.bind(this));
};

Generator.prototype.askForCssPreprocessor = function askForCssPreprocessor() {
    var cb = this.async();

    this.prompt([
        {
            type: 'list',
            name: 'cssPreprocessor',
            message: 'Would you like to use a CSS preprocessor like Sass (with Compass) or Less?',
            default: 0,
            choices: [
                {
                    name: 'None',
                    value: 'none'
                },
                {
                    name: 'Sass (with Compass)',
                    value: 'compass'
                },
                {
                    name: 'Less',
                    value: 'less'
                }
            ]
        }
    ], function (props) {
        switch (props.cssPreprocessor) {
            case 'compass':
            case 'less':
                this.nodeModules.push(props.cssPreprocessor);
                break;
        }

        cb();
    }.bind(this));
};

Generator.prototype.askForBootstrap = function askForBootstrap() {
    var compass = this.compass;
    var cb = this.async();

    this.prompt([
        {
            type: 'confirm',
            name: 'bootstrap',
            message: 'Would you like to include Bootstrap?',
            default: true
        },
        {
            type: 'confirm',
            name: 'compassBootstrap',
            message: 'Would you like to use the Sass version of Bootstrap?',
            default: true,
            when: function (props) {
                return props.bootstrap && this.nodeModules.indexOf('compass') !== -1;
            }.bind(this)
        },
        {
            type: 'confirm',
            name: 'lessBootstrap',
            message: 'Would you like to use the Less version of Bootstrap?',
            default: true,
            when: function (props) {
                return props.bootstrap && this.nodeModules.indexOf('less') !== -1;
            }.bind(this)
        }
    ], function (props) {
        this.bootstrap = props.bootstrap;
        this.compassBootstrap = props.compassBootstrap;

        cb();
    }.bind(this));
};

Generator.prototype.askForSpecialAngularModules = function askForSpecialAngularModules() {

};

Generator.prototype.askForAngularModules = function askForAngularModules() {
    var cb = this.async();

    var prompts = [
        {
            type: 'checkbox',
            name: 'components',
            message: 'Which components would you like to include?',
            choices: [
                new inquirer.Separator(),
                {
                    value: 'angular-animate',
                    name: chalk.cyan('angular-animate') + ' provides support for JavaScript, CSS3 transition and CSS3 keyframe animation hooks',
                    checked: true
                },
                {
                    value: 'angular-cookies',
                    name: chalk.cyan('angular-cookies') + ' provides a convenient wrapper for reading and writing browser cookies',
                    checked: true
                },
                {
                    value: 'angular-resource', // oder restangular
                    name: chalk.cyan('angular-resource') + ' provides interaction support with RESTful services',
                    checked: true
                },
                {
                    value: 'angular-route', // oder ui-router
                    name: chalk.cyan('angular-route') + ' provides routing and deeplinking services and directives',
                    checked: true
                },
                {
                    value: 'angular-sanitize',
                    name: chalk.cyan('angular-sanitize') + ' provides functionality to sanitize HTML',
                    checked: true
                },
                {
                    value: 'angular-touch',
                    name: chalk.cyan('angular-touch') + ' provides touch events and other helpers for touch-enabled devices',
                    checked: true
                },
                {
                    value: 'angular-i18n',
                    name: chalk.cyan('angular-i18n') + ' internationalization module for AngularJS',
                    checked: true
                },
                {
                    value: 'angular-loader',
                    name: chalk.cyan('angular-loader') + ' initialize Angular manually',
                    checked: true
                },
                {
                    value: 'angular-messages',
                    name: chalk.cyan('angular-messages') + ' provides enhanced support for displaying messages within templates',
                    checked: true
                },
                {
                    value: 'angular-aria',
                    name: chalk.cyan('angular-aria') + ' provides support for adding aria tags',
                    checked: true
                },
                {
                    value: 'angular-material',
                    name: chalk.cyan('angular-material') + ' Material design for Angular',
                    checked: true
                }
            ]
        }
    ];

    this.prompt(prompts, function (props) {
        var hasMod = function (mod) {
            return props.components.indexOf(mod) !== -1;
        };
        this.animateModule = hasMod('animateModule');
        this.cookiesModule = hasMod('cookiesModule');
        this.resourceModule = hasMod('resourceModule');
        this.routeModule = hasMod('routeModule');
        this.sanitizeModule = hasMod('sanitizeModule');
        this.touchModule = hasMod('touchModule');

        var angMods = [];
        for (var i = 0; i < props.components.length; i++) {
            var suffix = props.components[i].replace('angular-', '');
            suffix = suffix.charAt(0).toUpperCase() + suffix.substr(1);
            angMods.push("'ng" + suffix + "'");
        }

        if (this.animateModule) {
            angMods.push("'ngAnimate'");
        }

        if (this.cookiesModule) {
            angMods.push("'ngCookies'");
        }

        if (this.resourceModule) {
            angMods.push("'ngResource'");
        }

        if (this.routeModule) {
            angMods.push("'ngRoute'");
            this.env.options.ngRoute = true;
        }

        if (this.sanitizeModule) {
            angMods.push("'ngSanitize'");
        }

        if (this.touchModule) {
            angMods.push("'ngTouch'");
        }

        if (angMods.length) {
            this.env.options.angularDeps = '\n    ' + angMods.join(',\n    ') + '\n  ';
        }

        cb();
    }.bind(this));
};

Generator.prototype.askForExplicitBowerComponents = function askForExplicitBowerComponents(asyncDoneFn) {
    var cb = asyncDoneFn || this.async(),

        _askForExplicitBowerComponent = function _askForExplicitBowerComponent() {
            this.prompt([
                {
                    type: 'input',
                    name: 'bowerComponentSearchTerm',
                    message: 'Bower component name:'
                }
            ], function (props) {
                progressIcon.start();
                bower.commands
                    .search(props.bowerComponentSearchTerm)
                    .on('end', function (results) {
                        progressIcon.stop();
                        _promptBowerSearchResultList(props.bowerComponentSearchTerm, results);
                    });

            }.bind(this));
        }.bind(this),

        _promptBowerSearchResultList = function _promptBowerSearchResultList(searchTerm, results) {
            var VALUE_SEARCH_AGAIN = -1,
                VALUE_ABORT = -2,
                choices = [
                {
                    name: 'Search again',
                    value: VALUE_SEARCH_AGAIN
                },
                {
                    name: 'Abort',
                    value: VALUE_ABORT
                },
                new inquirer.Separator(),
            ].concat(results.map(function (module) {
                    return {
                        name: chalk.green(module.name) + ' ' + module.url,
                        value: module.name
                    };
                }));

            if (results.length) {
                // prompt list bower module search results
                this.prompt([
                    {
                        type: 'list',
                        name: 'bowerComponent',
                        message: 'Found bower components (' + results.length + '):',
                        default: 0,
                        choices: choices
                    }
                ], function (props) {
                    switch (props.bowerComponent) {
                        case VALUE_SEARCH_AGAIN:
                            _askForExplicitBowerComponent();
                            break;
                        case VALUE_ABORT:
                            cb();
                            break;
                        default:
                            this.bowerComponents.push(props.bowerComponent);
                            this.askForExplicitBowerComponents();
                    }
                }.bind(this));
            } else {
                // prompt message that no bower modules were found
                this.log(chalk.red('bower module "' + searchTerm + '" doens´t exist.'));
                this.askForExplicitBowerComponents(cb);
            }

        }.bind(this);

    this.prompt([
        {
            type: 'confirm',
            name: 'customComponent',
            message: 'Would you like to add some more bower components?',
            default: true
        }
    ], function (props) {
        if (props.customComponent) {
            _askForExplicitBowerComponent();
        } else {
            cb();
        }
    }.bind(this));
};

Generator.prototype.readIndex = function readIndex() {
    this.ngRoute = this.env.options.ngRoute;
    this.indexFile = this.engine(this.read('app/index.html'), this);
};

Generator.prototype.bootstrapFiles = function bootstrapFiles() {
    var cssFile = 'styles/main.' + (this.compass ? 's' : '') + 'css';
    this.copy(
        path.join('app', cssFile),
        path.join(this.appPath, cssFile)
    );
};

Generator.prototype.appJs = function appJs() {
    this.indexFile = this.appendFiles({
        html: this.indexFile,
        fileType: 'js',
        optimizedPath: 'scripts/scripts.js',
        sourceFileList: ['scripts/app.js', 'scripts/controllers/main.js'],
        searchPath: ['.tmp', this.appPath]
    });
};

Generator.prototype.createIndexHtml = function createIndexHtml() {
    this.indexFile = this.indexFile.replace(/&apos;/g, "'");
    this.write(path.join(this.appPath, 'index.html'), this.indexFile);
};

Generator.prototype.packageFiles = function packageFiles() {
    this.coffee = this.env.options.coffee;
    this.template('root/_bower.json', 'bower.json');
    this.template('root/_bowerrc', '.bowerrc');
    this.template('root/_package.json', 'package.json');
    this.template('root/_Gruntfile.js', 'Gruntfile.js');
};

Generator.prototype._injectDependencies = function _injectDependencies() {
    if (this.options['skip-install']) {
        this.log(
                'After running `npm install & bower install`, inject your front end dependencies' +
                '\ninto your source code by running:' +
                '\n' +
                '\n' + chalk.yellow.bold('grunt wiredep')
        );
    } else {
        wiredep({
            directory: 'bower_components',
            bowerJson: JSON.parse(fs.readFileSync('./bower.json')),
            ignorePath: new RegExp('^(' + this.appPath + '|..)/'),
            src: 'app/index.html',
            fileTypes: {
                html: {
                    replace: {
                        css: '<link rel="stylesheet" href="{{filePath}}">'
                    }
                }
            }
        });
    }
};
