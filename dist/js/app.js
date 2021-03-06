(function() {
    angular
        .module('xApp', dependencies())
        .config(config);

    function dependencies() {
        return [
            'ngSanitize',
            'ngResource',
            'ngAnimate',
            'ngCookies',
            'ui.bootstrap',
            'ui.router',
            'ui.select',
            'angularMoment',
            'toaster',
            'angular-jwt',
            'cfp.hotkeys',
            'colorpicker.module'
        ];
    }

    function config($stateProvider, $urlRouterProvider, $httpProvider, hotkeysProvider, uiSelectConfig, jwtInterceptorProvider) {
        uiSelectConfig.theme = 'bootstrap';
        hotkeysProvider.includeCheatSheet = false;
        $stateProvider
            .state('anon', {
                abstract: true,
                template: "<ui-view/>",
                data: {
                    access: ['anon']
                }
            })
            .state('anon.check', {
                url: '',
                controller: function($location, AuthFactory) {
                    if (AuthFactory.isLoggedIn()) {
                        $location.path('/recent');
                    } else {
                        $location.path('/login');
                    }
                }
            })
            .state('anon.login', {
                url: '/login',
                templateUrl: 'auth/login.html',
                controller: 'AuthController',
                data: {
                  bodyClass: 'login-page'
                }
            });

        $stateProvider
            .state('user', {
                abstract: true,
                templateUrl: 'home/home.html',
                controller: function($scope, $rootScope, $location, $modal, projects, AuthFactory, Api, $filter, $state, hotkeys) {
                    $scope.projects = projects;
                    $scope.login = AuthFactory.getUser();
                    $scope.isEntryActive = $state.is('user.project');

                    hotkeys.add({
                        combo: 'ctrl+k',
                        description: 'Show project jump window',
                        allowIn: ['input', 'select', 'textarea'],
                        callback: function(event) {
                            event.preventDefault();
                            $modal.open({
                                templateUrl: 'project/projectJumper.html',
                                controller: 'ModalProjectJumperController',
                                size: 'sm',
                                resolve: {
                                    projects: function() {
                                        return $scope.projects;
                                    }
                                }
                            });
                        }
                    });

                    $rootScope.$on('$stateChangeStart', function(event, toState) {
                        $scope.isEntryActive = toState.name == 'user.project' || toState.name == 'user.projects';
                    });

                    $scope.$on('project:update', function(event, project) {
                        $scope.projects[$scope.projects.map(function (i) {return i.id;}).indexOf(project.id)] = project;
                    });
                },
                resolve: {
                    projects: function(Api) {
                        return Api.project.query();
                    }
                }
            })
            .state('user.home', {
                url: '/recent',
                templateUrl: 'home/recentlyUsed.html',
                controller: 'HomeController',
                resolve: {
                    recent: function(RecentFactory) {
                        return RecentFactory.query();
                    }
                }
            })
            .state('user.project', {
                url: '/project/:projectId/:active?',
                templateUrl: 'entry/list.html',
                controller: 'EntryController',
                resolve: {
                    project: function ($stateParams, projects) {
                        return projects.$promise.then(function(projects) {
                            for (var i=0; i<projects.length; i++) {
                                if (projects[i].id == parseInt($stateParams.projectId)) {
                                    return projects[i];
                                }
                            }
                            throw "Project not found!";
                        });
                    },
                    entries: function($stateParams, Api) {
                        return Api.projectKeys.query({id: $stateParams.projectId});
                    },
                    active: function($stateParams, entries) {
                        if ($stateParams.active) {
                            return entries.$promise.then(function(entries) {
                                return _.find(
                                    entries,
                                    _.matchesProperty('id', parseInt($stateParams.active))
                                );
                            });
                        }
                        return {};
                    }
                }
            })
            .state('user.list', {
                url: '/users',
                templateUrl: 'user/userList.html',
                controller: 'UserListController',
                resolve: {
                    users: function(Api) {
                        return Api.user.query();
                    }
                }
            })
            .state('user.personal', {
                url: '/personal',
                templateUrl: 'personal/personal.html',
                controller: 'PersonalController',
                resolve: {
                    entries: function($stateParams, Api) {
                        return Api.personalKeys.query();
                    }
                }
            })
            .state('user.projects', {
                url: '/projects/:active?',
                templateUrl: 'project/list.html',
                controller: 'ProjectController',
                resolve: {
                    active: function($stateParams) {
                        return $stateParams.active;
                    }
                }
            })
            .state('user.history', {
                url: '/history',
                templateUrl: 'history/list.html',
                controller: 'HistoryController',
                resolve: {
                    history: function(HistoryFactory) {
                        return HistoryFactory.query();
                    }
                }
            })
            .state('user.api', {
                url: '/api',
                templateUrl: 'api/list.html',
                controller: 'ApiController'
            })
            .state('user.teams', {
                url: '/teams',
                templateUrl: 'team/teamList.html',
                controller: 'TeamListController',
                resolve: {
                    teams: function(Api) {
                        return Api.team.query();
                    }
                }
            })
            .state('user.404', {
                url: '/404',
                templateUrl: 'error/404.html'
            });

        $urlRouterProvider.otherwise('/404');

        jwtInterceptorProvider.tokenGetter = function(config, AuthFactory) {
            var idToken = AuthFactory.getToken();

            if (config.url.substr(config.url.length - 5) == '.html') {
                return null;
            }

            if (idToken && AuthFactory.tokenExpired()) {
                return AuthFactory.refreshToken();
            }

            return idToken;
        };

        $httpProvider.interceptors.push('jwtInterceptor');
        $httpProvider.interceptors.push('AuthInterceptor');
    }
})();

(function() {
    angular
        .module('xApp')
        .factory('Api', apiFactory);

    function apiFactory($resource) {
        return {
            auth: $resource("/internal/auth"),
            project: $resource("/api/project/:id", null, enableCustom),
            projectKeys: $resource("/api/project/keys/:id"),
            personalKeys: $resource("/api/personal/keys"),
            assignedTeams: $resource("/api/project/teams/:id", null, enableCustom),
            user: $resource("/api/user/:id", null, enableCustom),
            team: $resource("/api/team/:id", null, enableCustom),
            teamMembers: $resource("/api/teamMembers/:id", null, enableCustom),
            projectTeams: $resource("/api/projectTeams/:id", null, enableCustom),
            entryTeams: $resource("/api/entryTeams/:id", null, enableCustom),
            entryTags: $resource("/api/entryTags/:id", null, enableCustom),
            authStatus: $resource("/internal/auth/status", null),
            profile: $resource("/api/profile", null, enableCustom),
            share: $resource("/api/share/:id", null, enableCustom),
            entry: $resource("/api/entry/:id", null, angular.extend(enableCustom, {
                password: { method: 'GET', params: {id: '@id'} }
            })),
            entryAccess: $resource("/api/entry/access/:id", null),
            entryPassword: $resource("/api/entry/password/:id", {}, {
                password: { method: 'GET', params: {id: '@id'} }
            })
        }
    }

    var enableCustom = {
        update: {
            method: 'PUT', params: {id: '@id'}
        },
        delete: {
            method: 'DELETE', params: {id: '@id'}
        }
    };
})();

(function() {
    angular
        .module('xApp')
        .controller('ApiController', ctrl);

    function ctrl($scope, AuthFactory) {
        $scope.code = AuthFactory.getCode();
        $scope.user = AuthFactory.getUser().email;
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('AuthController', authController);

    function authController($scope, AuthFactory) {
        $scope.login = login;

        function login() {
            AuthFactory.initLogin($scope.email, $scope.password, $scope.remember);
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .factory('AuthFactory', auth);

    function auth($rootScope, $sanitize, $http, $location, Api, toaster, jwtHelper) {
        var localToken = 'auth_token';
        var refreshingToken = null;

        return {
            login: login,
            logout: logout,
            getUser: getUser,
            getCode: getCode,
            isLoggedIn: isLoggedIn,
            initLogin: initLogin,
            getToken: getToken,
            tokenExpired: tokenExpired,
            setToken: setToken,
            refreshToken: refreshToken
        };

        function getToken() {
            return localStorage.getItem(localToken);
        }

        function setToken(token) {
            localStorage.setItem(localToken, token);
        }

        function login(token) {
            setToken(token);
            $rootScope.$broadcast('auth:login', getUser());
        }

        function logout() {
            localStorage.removeItem(localToken);

            $rootScope.$broadcast('auth:login', null);
        }

        function getUser() {
            var token = getToken();
            if (token) {
                try {
                    return jwtHelper.decodeToken(token).user;
                } catch(err) {}
            }
            return [];
        }

        function getCode() {
            var token = getToken();
            if (token) {
                try {
                    return jwtHelper.decodeToken(token).code;
                } catch(err) {}
            }
            return [];
        }

        function tokenExpired() {
            return jwtHelper.isTokenExpired(getToken());
        }

        function isLoggedIn() {
            return getUser().id > 0;
        }

        function initLogin(username, password, remember) {
            Api.auth.save({
                email: $sanitize(username),
                password: $sanitize(password),
                remember: $sanitize(remember)
            }, function (response) {
                login(response.token);
                $location.path('/recent');
                toaster.pop('info', "", "Welcome back, " + getUser().name);
            }, function (response) {
                toaster.pop('error', "Login Failed", response.data[0]);
            })
        }

        function refreshToken() {
            if (refreshingToken == null) {
                refreshingToken = $http({
                    url: '/internal/auth/refresh',
                    skipAuthorization: true,
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + getToken()
                    }
                }).then(function(response) {
                    var token = response.data.token;
                    setToken(token);
                    refreshingToken = null;

                    return token;
                });
            }

            return refreshingToken;
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .factory('AuthInterceptor', authInterceptor);

    function authInterceptor($q, $injector, $location, toaster) {
        return {
            response: response,
            responseError: error
        };

        function response(response) {
            return response || $q.when(response);
        }

        function error(rejection) {
            var AuthFactory = $injector.get('AuthFactory');

            if (rejection.status === 400 || rejection.status === 401) {
                if (AuthFactory.isLoggedIn()) {
                    toaster.pop('warning', 'Session Expired', 'Please log in.');
                    AuthFactory.logout();
                }
                $location.path('/login');
            }

            if (rejection.status === 403) {
                toaster.pop('error', "Forbidden", 'You cannot access this resource.');
            }

            if (rejection.status === 419) {
                toaster.pop('warning', "Validation Error", rejection.data);
            }

            return $q.reject(rejection);
        }
    }

})();
(function() {
    angular
        .module('xApp')
        .directive('copyPassword', copyPasswordDirective);

    function copyPasswordDirective() {
        return {
            restrict: 'E',
            template:
                '<a ng-click="download()" class="btn btn-default btn-xs" title="Copy password" ng-if="isState(\'download\')">' +
                    '<i class="glyphicon glyphicon-open"></i>' +
                '</a>' +
                '<a class="btn btn-default btn-xs" title="Please wait..." ng-if="isState(\'waiting\')">' +
                    '<i class="fa fa-spinner fa-spin"></i>' +
                '</a>' +
                '<a class="btn btn-info btn-xs" ng-click="copy()" title="Copy password" ng-if="isState(\'copy\')">' +
                    '<i class="glyphicon glyphicon-save"></i>' +
                '</a>',
            scope: {
                entry: '='
            },
            controller: function($scope, Api, toaster, $rootScope, CopyService) {
                $scope.state = 'download';
                $scope.isState = isState;
                $scope.download = downloadPassword;
                $scope.copy = copyPassword;
                $scope.password = '';

                $scope.$on('$destroy', cleanup);
                $scope.$on("PasswordRequest", onPasswordRequest);

                function onPasswordRequest(e, entry) {
                    if (entry.id != $scope.entry.id) {
                        return;
                    }

                    if ($scope.state == "download") {
                        downloadPassword();
                        return;
                    }

                    if ($scope.state == "copy") {
                      CopyService.copy($scope.password).then(function() {
                        $rootScope.$broadcast("AppFocus");
                      });
                    }
                }

                function isState(state) {
                    return $scope.state == state;
                }

                function copyPassword() {
                  CopyService.copy($scope.password);
                }

                function downloadPassword() {
                    $scope.state = 'waiting';
                    Api.entryPassword.password({id: $scope.entry.id}, function(response) {
                        $scope.password = response.password;
                        response.$promise.then(function() {
                            $scope.state = 'copy';
                        });
                    });
                }

                function cleanup() {
                  CopyService.cleanup();
                }
            }
        };
    }
})();

(function() {
  angular
    .module('xApp')
    .directive('copyable', CopyableDirective);

  function CopyableDirective(toaster) {
    return {
      restrict: 'A',
      scope: {
        entry: '='
      },
      link: function(scope, element) {
        element.on('click', function() {
          selectElementText(element[0]);
          try {
            if (document.execCommand("copy")) {
              toaster.pop('success', "", 'Copied to clipboard.');
            }
          } catch (e) {}
        });
      }
    };
  }

  function selectElementText(el) {
    var sel, range;
    if (window.getSelection && document.createRange) {
      sel = window.getSelection();
      range = document.createRange();
      range.selectNodeContents(el);
      sel.removeAllRanges();
      sel.addRange(range);
    } else if (document.body.createTextRange) {
      range = document.body.createTextRange();
      range.moveToElementText(el);
      range.select();
    }
  }
})();

(function() {
    angular
        .module('xApp')
        .directive('entryAccessInfo', entryAccessInfoDirective);

    function entryAccessInfoDirective() {
        return {
            restrict: 'A',
            scope: {
                entryAccessInfo: '='
            },
            link: function($scope, $elem) {
                $elem.on('click', $scope.info);
            },
            controller: function($rootScope, $scope, $modal) {
                $scope.info = entryInfo;

                function entryInfo() {
                    $modal.open({
                        templateUrl: 'entry/access.html',
                        controller: function($scope, $modalInstance, access, entry) {
                            $scope.access = access;
                            $scope.entry = entry;
                        },
                        resolve: {
                            access: function(Api) {
                                return Api.entryAccess.query({id: $scope.entryAccessInfo.id});
                            },
                            entry: function() {
                                return $scope.entryAccessInfo;
                            }
                        }
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('entryCreate', entryCreateDirective);

    function entryCreateDirective($modal, $rootScope, hotkeys) {
        return {
            restrict: 'A',
            scope: {
                project: '=entryCreate'
            },

            link: function($scope, element) {
                hotkeys.add({
                    combo: 'ctrl+i',
                    description: 'Add new entry',
                    allowIn: ['input', 'select', 'textarea'],
                    callback: function(event, hotkey) {
                        openEntryModal();
                    }
                });

                element.on('click', function() {
                    openEntryModal();
                });

                function openEntryModal() {
                    $modal.open({
                        templateUrl: 'entry/form.html',
                        controller: 'ModalCreateEntryController',
                        resolve: {
                            project_id: function () {
                                return $scope.project ? $scope.project.id : undefined;
                            }
                        }
                    }).result.then(onModalSuccess, onModalDismiss);
                }

                function onModalSuccess(model) {
                    $rootScope.$broadcast('entry:create', model);
                    $rootScope.$broadcast('AppFocus');
                }

                function onModalDismiss() {
                    setTimeout(function(){ $rootScope.$broadcast("AppFocus"); }, 400);
                }

                $scope.$on('$destroy', function(){
                    hotkeys.del('ctrl+i');
                });
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('entryDelete', entryDeleteDirective);

    function entryDeleteDirective() {
        return {
            restrict: 'A',
            scope: {
                entry: '=entryDelete'
            },
            link: function($scope, element) {
                element.on('click', function(e){
                    $scope.delete();
                });
            },
            controller: function($rootScope, $scope, Api) {
                $scope.delete = entryDelete;

                function entryDelete() {
                    if (!confirm('Are you sure?')) {
                        return;
                    }

                    Api.entry.delete({id: $scope.entry.id});
                    $rootScope.$broadcast('entry:delete', $scope.entry);
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('entryShare', entryShareDirective);

    function entryShareDirective() {
        return {
            restrict: 'E',
            template:
                '<a ng-click="share()" class="btn btn-success btn-xs" title="Share to User">' +
                    '<i class="glyphicon glyphicon-link"></i> Share' +
                '</a>',
            scope: {
                entry: '='
            },
            controller: function($rootScope, $scope, $modal) {
                $scope.share = shareEntry;

                function shareEntry() {
                    $modal.open({
                        templateUrl: 'entry/share.html',
                        controller: 'ModalShareController',
                        resolve: {
                            users: function(Api) {
                                return Api.user.query();
                            },
                            access: function(Api) {
                                return Api.share.query({id: $scope.entry.id});
                            },
                            entry: function() {
                                return $scope.entry;
                            },
                            teams: function(Api) {
                                return Api.team.query();
                            },
                            entryTeams: function(Api) {
                                return Api.entryTeams.query({id: $scope.entry.id});
                            }
                        }
                    }).result.then(function (model) {
                        $rootScope.$broadcast('entry:share', model);
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('entryTag', entryTagDirective);

    function entryTagDirective() {
        return {
            restrict: 'E',
            template:
                '<a ng-click="tag()" class="btn btn-link btn-xs" title="Manage Tags">' +
                    '<i class="fa fa-pencil"></i> Tags' +
                '</a>',
            scope: {
                entry: '='
            },
            controller: function($rootScope, $scope, $modal) {
                $scope.tag = tagEntry;

                function tagEntry() {
                    $modal.open({
                        templateUrl: 'entry/tag.html',
                        controller: 'ModalTagController',
                        resolve: {
                            entry: function() {
                                return $scope.entry;
                            },
                            tags: function(Api) {
                                return Api.entryTags.query();
                            }
                        }
                    }).result.then(function (model) {
                        $rootScope.$broadcast('entry:tag', model);
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('entryUpdate', entryUpdateDirective);

    function entryUpdateDirective() {
        return {
            restrict: 'A',
            scope: {
                entry: '=entryUpdate',
                on: '='
            },
            link: function($scope, element) {
                if (!$scope.entry.can_edit) {
                    return;
                }

                element.on('click', function(e){
                    $scope.update();
                });
            },
            controller: function($rootScope, $scope, $modal) {
                $scope.update = updateEntry;

                function updateEntry() {
                    $modal.open({
                        templateUrl: 'entry/form.html',
                        controller: 'ModalUpdateEntryController',
                        resolve: {
                            entry: function(Api) {
                                return Api.entry.get({id: $scope.entry.id});
                            }
                        }
                    }).result.then(function (model) {
                        $rootScope.$broadcast('entry:update', model);
                    });
                }
            }
        };
    }
})();

/*global angular */
/**
 * Directive that places focus on the element it is applied to when the expression it binds to evaluates to true
 */
(function () {
    angular
        .module('xApp')
        .directive('appFocus', appFocusDirective);

    function appFocusDirective($parse) {
        return function (scope, elem, attrs) {
            var select = attrs.hasOwnProperty('appFocusSelect');
            var optionsFn = angular.noop;
            if (select) {
                optionsFn = $parse(attrs.appFocusSelect) || optionsFn;
            }
            if (!attrs.appFocus) {
                focus();
            } else {
                scope.$watch(attrs.appFocus, function (newVal) {
                    if (newVal) {
                        focus();
                    }
                });
            }
            function focus() {
                setTimeout(function () {
                    elem[0].focus();
                    select && selectInput();
                }, 200);
            }

            function selectInput() {
                var options = optionsFn(scope);
                if (options) {

                    elem[0].setSelectionRange(
                        options.start || 0,
                        options.end || 0
                    );
                } else {
                    elem[0].select();
                }
                return elem[0];
            }

            scope.$on("AppFocus", function() {
                selectInput();
            });
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('logout', logoutDirective);

    function logoutDirective() {
        return {
            restrict: 'E',
            template:
                '<a class="btn btn-side-menu" ng-click="logout()" tooltip-placement="right" tooltip="Log-out ({{login.email}})">' +
                    '<i class="fa fa-sign-out fa-2x"></i>' +
                '</a>',
            controller: function($scope, Api, AuthFactory, $location) {
                $scope.logout = logout;

                function logout() {
                    Api.auth.get({}, function() {
                        AuthFactory.logout(true);
                        $location.path('/login');
                    })
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('profile', profileDirective);

    function profileDirective() {
        return {
            restrict: 'E',
            template:
                '<a class="btn btn-side-menu" ng-click="profile()" tooltip-placement="right" tooltip="Edit Profile">' +
                    '<i class="fa fa-wrench fa-2x"></i>' +
                '</a>',
            controller: function($scope, $modal) {
                $scope.profile = profile;

                function profile() {
                    $modal.open({
                        templateUrl: 'user/profile.html',
                        controller: 'ProfileController'
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('projectInfo', directive);

    function directive() {
        return {
            restrict: 'A',
            scope: {
                projectInfo: '='
            },
            link: function(scope, element) {
                element.on('click', scope.openModal);
            },
            controller: function($scope, $modal) {
                $scope.openModal = openModal;

                function openModal() {
                    $modal.open({
                        templateUrl: 'project-team/assigned.html',
                        controller: function($scope, teams, project, owner) {
                            $scope.teams = teams;
                            $scope.project = project;
                            $scope.owner = owner;
                        },
                        resolve: {
                            teams: function(Api) {
                                return Api.assignedTeams.query({id: $scope.projectInfo.id});
                            },
                            project: function() {
                                return $scope.projectInfo;
                            },
                            owner: function(Api) {
                                return Api.user.get({id: $scope.projectInfo.user_id});
                            }
                        }
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('projectTeams', directive);

    function directive() {
        return {
            restrict: 'A',
            scope: {
                projectTeams: '='
            },
            link: function(scope, element) {
                element.on('click', scope.openModal);
            },
            controller: function($scope, $modal) {
                $scope.openModal = openModal;

                function openModal() {
                    $modal.open({
                        templateUrl: 'project-team/teams.html',
                        controller: 'ProjectTeamController',
                        resolve: {
                            teams: function (Api) {
                                return Api.team.query();
                            },
                            access: function (Api) {
                                return Api.projectTeams.query({id: $scope.projectTeams.id});
                            },
                            project: function () {
                                return $scope.projectTeams;
                            }
                        }
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('projectUpdate', projectUpdateDirective);

    function projectUpdateDirective() {
        return {
            restrict: 'A',
            scope: {
                projectUpdate: '='
            },
            link: function($scope, elem) {
                elem.on('click', function() {
                    $scope.update();
                });
            },
            controller: function($rootScope, $scope, $modal) {
                $scope.update = updateProject;

                function updateProject() {
                    $modal.open({
                        templateUrl: 'project/form.html',
                        controller: 'ModalUpdateProjectController',
                        resolve: {
                            project: function(Api) {
                                return Api.project.get({id: $scope.projectUpdate.id});
                            }
                        }
                    }).result.then(function (model) {
                        $rootScope.$broadcast('project:update', model);
                    });
                }
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .directive('triggerChange', triggerChangeDirective);

    function triggerChangeDirective() {
        return {
            restrict: 'A',
            priority: -10,
            link: function (scope, element) {
                element.on('submit', function(){
                    angular.forEach(element.find('input'), function(field) {
                        angular.element(field).triggerHandler('change');
                    });
                });
            }
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('EntryController', controller);

    function controller($scope, $filter, hotkeys, entries, project, active, $rootScope) {

        $scope.entries = entries;
        $scope.project = project;
        $scope.active = active;
        $scope.search = {};
        $scope.tags = [];
        $scope.setActive = setActive;
        $scope.getFiltered = getFiltered;

        $scope.entries.$promise.then(function(){
            if (!$scope.active || !$scope.active.id && $scope.entries.length > 0) {
                $scope.active = $scope.entries[0];
            }
        });

        $scope.$watch("search", onFilterChanged, true);

        $scope.$on('entry:create', onEntryCreate);
        $scope.$on('entry:update', onEntryUpdate);
        $scope.$on('entry:delete', onEntryDelete);

        $scope.$on('$destroy', unbindShortcuts);
        $scope.$on('modal:open', unbindShortcuts);
        $scope.$on('modal:close', bindShortcuts);

        $scope.$on('project:update', function(event, project) {
            $scope.project = project;
        });

        bindShortcuts();

        function onFilterChanged() {
            var filtered = getFiltered();
            var current = _.findIndex(filtered, function(x) {
                return $scope.active && x.id == $scope.active.id;
            });
            if (current == -1 && filtered.length > 0) {
                $scope.active = filtered[0];
            }
        }

        function getFiltered() {
            return $filter('filter')($scope.entries, { $: $scope.search.query });
        }

        function setActive(entry) {
            $scope.active = entry;
        }

        function onEntryCreate(event, model) {
            $scope.entries.push(model);
        }

        function onEntryUpdate(event, model) {
            var index = getEntryIndex(model);

            if (index >= 0) {
                $scope.entries[index] = model;
            }

            setActive(model);
        }

        function onEntryDelete(event, model) {
            var index = getEntryIndex(model);

            if (index >= 0) {
                $scope.entries.splice(index, 1);
            }

            setActive({});
        }

        function getEntryIndex(entry) {
            return $scope.entries.map(function(e) {return parseInt(e.id)}).indexOf(parseInt(entry.id));
        }

        function bindShortcuts() {
            hotkeys.add({
                combo: 'return',
                description: 'Download and copy password',
                allowIn: ['input', 'select', 'textarea'],
                callback: function() {
                    $rootScope.$broadcast("PasswordRequest", $scope.active);
                }
            });

            hotkeys.add({
                combo: 'up',
                description: 'Show project jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    var current = _.findIndex(getFiltered(), function(x) {
                        return x.id == $scope.active.id;
                    });

                    var previous = getFiltered()[current - 1];
                    if (previous) {
                        $scope.active = previous;
                        scrollTo();
                    } else {
                        $rootScope.$broadcast("AppFocus");
                    }
                }
            });

            hotkeys.add({
                combo: 'down',
                description: 'Show project jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    var current = _.findIndex(getFiltered(), function(x) {
                        return x.id == $scope.active.id;
                    });

                    var next = getFiltered()[current + 1];
                    if (next) {
                        $scope.active = next;
                        scrollTo();
                    }
                }
            });
        }

        function unbindShortcuts() {
            hotkeys.del('return');
            hotkeys.del('up');
            hotkeys.del('down');
        }

        function scrollTo() {
            document.getElementById('e-'+$scope.active.id).scrollIntoViewIfNeeded();
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ModalCreateEntryController', function($scope, $modalInstance, Api, project_id) {
        $scope.entry = {
            project_id: project_id
        };

        $scope.ok = function () {
            Api.entry.save($scope.entry,
                function(response) {
                    $modalInstance.close(response);
                }
            );
        };

        $scope.generate = function() {
            $scope.entry.password = Password.generate(16);
        };
    });

})();


(function() {
    angular
        .module('xApp')
        .controller('ModalGetPasswordController', function($scope, $modalInstance, password, entry) {
        $scope.password = password;
        $scope.entry = entry;

        $scope.shown = false;

        $scope.ok = function () {
            $modalInstance.close();
        };

        $scope.show = function() {
            $scope.shown = true;
        };

        $scope.hide = function() {
            $scope.shown = false;
        };

        $scope.cancel = function() {
            $modalInstance.dismiss('cancel');
        };

        $scope.download = function() {
            var a = document.createElement('a');
            a.href = 'data:application/octet-stream;charset=utf-8,' + encodeURI($scope.password.password);
            a.target = '_blank';
            a.download = $scope.entry.username ? $scope.entry.username : $scope.entry.id;
            document.body.appendChild(a);
            a.click();
            a.parentNode.removeChild(a);
        }
    });

})();

(function() {
    angular
        .module('xApp')
        .controller('ModalShareController', shareController);

    function shareController($scope, Api, users, access, entry, teams, entryTeams) {
        $scope.users = users;
        $scope.access = access;
        $scope.entry = entry;
        $scope.teams = teams;
        $scope.entryTeams = entryTeams;

        $scope.share = {
            user: 0,
            team: 0
        };

        $scope.users.$promise.then(function() {
            $scope.share.user = $scope.users[0] ? $scope.users[0].id : 0;
        });

        $scope.teams.$promise.then(function() {
            $scope.share.team = $scope.teams[0] ? $scope.teams[0].id : 0;
        });

        $scope.shareUser = function() {
            Api.share.save({
                user_id: $scope.share.user,
                id: $scope.entry.id
            }, function(response) {
                $scope.access.push(response);
            });
        };

        $scope.shareTeam = function() {
            Api.entryTeams.save({
                team_id: $scope.share.team,
                id: $scope.entry.id
            }, function(response) {
                $scope.entryTeams.push(response);
            });
        };

        $scope.revokeUser = function(accessId) {
            Api.share.delete({
                id: accessId
            }, function() {
                $scope.access.splice($scope.access.map(function(i) {return i.id;}).indexOf(accessId), 1);
            });
        };

        $scope.revokeTeam = function(accessId) {
            Api.entryTeams.delete({
                id: accessId
            }, function() {
                $scope.entryTeams.splice($scope.entryTeams.map(function(i) {return i.id;}).indexOf(accessId), 1);
            });
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ModalTagController', ctrl);

    function ctrl($scope, Api, entry, tags) {
        $scope.tags = tags;
        $scope.entry = entry;

        $scope.tag = defaultTag();

        $scope.createTag = function() {
            Api.entryTags.save({color: $scope.tag.color, name: $scope.tag.name, entryId: entry.id}, function(res) {
                $scope.entry.tags.push(res);
                $scope.tags.push(res);
                $scope.tag = defaultTag();
            });
        };

        $scope.removeTag = function(tag) {
            Api.entryTags.delete({id: tag.id}, function() {
                var index = $scope.entry.tags.map(function (e) { return e.id; }).indexOf(tag.id);
                $scope.entry.tags.splice(index, 1);

                if (_.findWhere($scope.tags, {name: tag.name, entry_id: entry.id})) {
                    var tagIndex = $scope.tags.map(function (e) { return e.name; }).indexOf(tag.name);
                    $scope.tags.splice(tagIndex, 1);
                }
            });
        };

        $scope.addTag = function(tag) {
            Api.entryTags.save({color: tag.color, name: tag.name, entryId: entry.id}, function(res) {
                $scope.entry.tags.push(res);
                $scope.tag = defaultTag();
            });
        };

        $scope.availableTags = function() {
            return _.filter($scope.tags, function(obj) {
                return !_.findWhere($scope.entry.tags, {name: obj.name});
            });
        };

        function defaultTag() {
            return {color: '#dbdbdb', name: ''};
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ModalUpdateEntryController', ctrl);

    function ctrl($scope, $modalInstance, Api, entry, GROUPS) {
        $scope.entry = entry;
        $scope.groups = GROUPS;

        $scope.ok = function () {
            Api.entry.update($scope.entry,
                function(response) {
                    $modalInstance.close(response);
                }
            );
        };

        $scope.generate = function() {
            if (confirm('Replace password with random one?')) {
                $scope.entry.password = Password.generate(16);
            }
        };
    }
})();

(function() {
  angular
    .module('xApp')
    .service('CopyService', service);

  function service($q, toaster) {
    var fake;

    return {
      copy: createElementAndCopy,
      cleanup: cleanup
    }

    function createElementAndCopy(text) {
      return createFakeElement(text)
        .then(copy)
        .then(cleanup)
        .then(success, failure);
    }

    function copy(element) {
      element.select();

      try {
        if (document.execCommand("copy")) {
          return true;
        }
      } catch (e) {}

      return $q.reject();
    }

    function createFakeElement(text) {
      var deferred = $q.defer();

      try {
        cleanup();
        var element = document.createElement("textarea");

        element.style.position = 'absolute';
        element.style.left = '-9999px';
        element.style.top = document.body.scrollTop + 'px';
        element.value = text;

        document.body.appendChild(element);
        fake = element;

        deferred.resolve(element);
      } catch (e) {
        deferred.reject(e);
      }

      return deferred.promise;
    }

    function cleanup() {
      if (fake) {
        document.body.removeChild(fake);
      }
      fake = null;
    }

    function success() {
      toaster.pop('success', "", 'Password copied to clipboard.');
    }

    function failure() {
      toaster.pop('warning', 'Could not copy', 'Click Command + C to copy');
      return $q.reject();
    }
  }
})();

(function() {
    angular
        .module('xApp')
        .constant('GROUPS', {
            admin: 'Administrator',
            member: 'Member',
            disabled: 'Disabled'
        });
})();

var Password = {

    _pattern : /[a-zA-Z0-9_\-\+\.]/,


    _getRandomByte : function()
    {
        // http://caniuse.com/#feat=getrandomvalues
        if(window.crypto && window.crypto.getRandomValues)
        {
            var result = new Uint8Array(1);
            window.crypto.getRandomValues(result);
            return result[0];
        }
        else if(window.msCrypto && window.msCrypto.getRandomValues)
        {
            var result = new Uint8Array(1);
            window.msCrypto.getRandomValues(result);
            return result[0];
        }
        else
        {
            return Math.floor(Math.random() * 256);
        }
    },

    generate : function(length)
    {
        return Array.apply(null, {'length': length})
            .map(function()
            {
                var result;
                while(true)
                {
                    result = String.fromCharCode(this._getRandomByte());
                    if(this._pattern.test(result))
                    {
                        return result;
                    }
                }
            }, this)
            .join('');
    }

};

(function() {
    angular
        .module('xApp')
        .directive('loader', loaderDirective)
        .directive('showPassword', showPasswordDirective)
        .directive('fileRead', fileReadDirective);

    function loaderDirective() {
        return {
            restrict: 'E',
            scope: {
                when: '=',
                type: '='
            },
            template: '<div class="loading-holder" ng-show="when"><ul class="loading"><li></li><li></li><li></li></ul></div>'
        };
    }

    function showPasswordDirective() {
        return {
            scope: {
                entry: '=showPassword'
            },
            restrict: 'A',
            link: function($scope, element) {
                element.on('click', function() {
                    if ($scope.entry.can_edit || $scope.entry.can_edit == undefined) {
                        $scope.showPassword();
                    }
                });
            },
            controller: function($scope, $modal, modal) {
                $scope.elementClass = $scope.elementClass || 'btn btn-info btn-xs';
                $scope.showPassword = showPasswordModal;

                function showPasswordModal() {
                    modal.showPassword($scope.entry.id);
                }
            }
        };
    }

    function fileReadDirective() {
        return {
            restrict: 'A',
            scope: {
                content: '=',
                name: '='
            },
            link: function(scope, element, attrs) {
                element.on('change', function(onChangeEvent) {
                    var reader = new FileReader();
                    var file = (onChangeEvent.srcElement || onChangeEvent.target).files[0];

                    reader.onload = function(onLoadEvent) {
                        scope.$apply(function() {
                            scope.content = onLoadEvent.target.result;
                            scope.name = file.name;
                        });
                    };
                    reader.readAsText(file);
                });
            }
        };
    }

})();

(function() {
    angular
        .module('xApp')
        .filter('userGroup', groupFilter)
        .filter('nl2br', nl2brFilter);

    function groupFilter(GROUPS) {
        return function(input) {
            return GROUPS[input];
        }
    }

    function nl2brFilter($sce) {
        return function(message, xhtml) {
            var is_xhtml = xhtml || true;
            var breakTag = (is_xhtml) ? '<br />' : '<br>';
            var msg = (message + '').replace(/([^>\r\n]?)(\r\n|\n\r|\r|\n)/g, '$1'+ breakTag +'$2');

            return $sce.trustAsHtml(msg);
        }
    }
})();

(function () {
    angular
        .module('xApp')
        .factory('modal', modal);

    function modal($modal) {
        return {
            showPassword: showPassword
        };

        function showPassword(entryId) {
            return $modal.open({
                templateUrl: 'entry/password.html',
                controller: 'ModalGetPasswordController',
                resolve: {
                    password: function (Api) {
                        return Api.entryPassword.password({id: entryId});
                    },
                    entry: function (Api) {
                        return Api.entry.get({id: entryId});
                    }
                }
            });
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('HistoryController', function($scope, history) {
            $scope.history = history;
        })
        .factory('HistoryFactory', function ($resource) {
            return $resource("/api/history", {}, {
                query: { method: 'GET', isArray: true }
            })
        });
})();

(function() {
    angular
        .module('xApp')
        .controller('HomeController', function($scope, recent, hotkeys, $rootScope) {
            $scope.recent = recent;
            $scope.active = {};
            $scope.setActive = setActive;
            $scope.$on('$destroy', onDestroy);

            hotkeys.add({
                combo: 'return',
                description: 'Download and copy password',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event, hotkey) {
                    $rootScope.$broadcast("PasswordRequest", $scope.active);
                }
            });

            hotkeys.add({
                combo: 'up',
                description: 'Show project jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event, hotkey) {
                    event.preventDefault();
                    var current = _.findIndex($scope.recent, function(x) {
                        return x.id == $scope.active.id;
                    });

                    var previous = $scope.recent[current - 1];
                    if (previous) {
                        $scope.active = previous;
                    }
                }
            });

            hotkeys.add({
                combo: 'down',
                description: 'Show project jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event, hotkey) {
                    event.preventDefault();
                    var current = _.findIndex($scope.recent, function(x) {
                        return x.id == $scope.active.id;
                    });

                    var next = $scope.recent[current + 1];
                    if (next) {
                        $scope.active = next;
                    }
                }
            });

            function setActive(entry) {
                $scope.active = entry;
            }

            function onDestroy() {
                hotkeys.del('return');
                hotkeys.del('up');
                hotkeys.del('down');
            }
        })
        .factory('RecentFactory', function ($resource) {
            return $resource("/api/recent", {}, {
                query: { method: 'GET', isArray: true }
            });
        });
})();

(function() {
  angular
    .module('xApp')
    .controller('VaultController', ctrl);

  function ctrl($scope) {
    var vm = this;
    vm.bodyClass = 'default';

    $scope.$on('$stateChangeSuccess', onRouteChange);

    function onRouteChange(event, toState, toParams, fromState, fromParams) {
      if (angular.isDefined(toState.data) && angular.isDefined(toState.data.bodyClass)) {
        vm.bodyClass = toState.data.bodyClass;
        return;
      }

      vm.bodyClass = 'default';
    }
  }
})();

(function() {
    angular
        .module('xApp')
        .controller('PersonalController', controller);

    function controller($scope, $filter, hotkeys, entries, $rootScope) {

        $scope.entries = entries;
        $scope.active = undefined;
        $scope.search = {};
        $scope.tags = [];
        $scope.setActive = setActive;
        $scope.getFiltered = getFiltered;

        $scope.entries.$promise.then(function(){
            if (!$scope.active || !$scope.active.id && $scope.entries.length > 0) {
                $scope.active = $scope.entries[0];
            }
        });

        $scope.$watch("search", onFilterChanged, true);

        $scope.$on('entry:create', onEntryCreate);
        $scope.$on('entry:update', onEntryUpdate);
        $scope.$on('entry:delete', onEntryDelete);

        $scope.$on('$destroy', unbindShortcuts);
        $scope.$on('modal:open', unbindShortcuts);
        $scope.$on('modal:close', bindShortcuts);


        bindShortcuts();

        function onFilterChanged() {
            var filtered = getFiltered();
            var current = _.findIndex(filtered, function(x) {
                return $scope.active && x.id == $scope.active.id;
            });
            if (current == -1 && filtered.length > 0) {
                $scope.active = filtered[0];
            }
        }

        function getFiltered() {
            return $filter('filter')($scope.entries, { $: $scope.search.query });
        }

        function setActive(entry) {
            $scope.active = entry;
        }

        function onEntryCreate(event, model) {
            $scope.entries.push(model);
        }

        function onEntryUpdate(event, model) {
            var index = getEntryIndex(model);

            if (index >= 0) {
                $scope.entries[index] = model;
            }

            setActive(model);
        }

        function onEntryDelete(event, model) {
            var index = getEntryIndex(model);

            if (index >= 0) {
                $scope.entries.splice(index, 1);
            }

            setActive({});
        }

        function getEntryIndex(entry) {
            return $scope.entries.map(function(e) {return parseInt(e.id)}).indexOf(parseInt(entry.id));
        }

        function bindShortcuts() {
            hotkeys.add({
                combo: 'return',
                description: 'Download and copy password',
                allowIn: ['input', 'select', 'textarea'],
                callback: function() {
                    $rootScope.$broadcast("PasswordRequest", $scope.active);
                }
            });

            hotkeys.add({
                combo: 'up',
                description: 'Show jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    var current = _.findIndex(getFiltered(), function(x) {
                        return x.id == $scope.active.id;
                    });

                    var previous = getFiltered()[current - 1];
                    if (previous) {
                        $scope.active = previous;
                        scrollTo();
                    } else {
                        $rootScope.$broadcast("AppFocus");
                    }
                }
            });

            hotkeys.add({
                combo: 'down',
                description: 'Show jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    var current = _.findIndex(getFiltered(), function(x) {
                        return x.id == $scope.active.id;
                    });

                    var next = getFiltered()[current + 1];
                    if (next) {
                        $scope.active = next;
                        scrollTo();
                    }
                }
            });
        }

        function unbindShortcuts() {
            hotkeys.del('return');
            hotkeys.del('up');
            hotkeys.del('down');
        }

        function scrollTo() {
            document.getElementById('e-'+$scope.active.id).scrollIntoViewIfNeeded();
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ModalCreateProjectController', ctrl);

    function ctrl($scope, $modalInstance, $state, Api, toaster) {
        $scope.project = {};

        $scope.ok = function () {
            Api.project.save($scope.project,
                function(response) {
                    $modalInstance.close(response);
                    toaster.pop('success', 'Project successfully created!');
                    $state.go('user.project', {projectId: response.id});
                }
            );
        };
    }
})();


(function() {
    angular
        .module('xApp')
        .controller('ModalProjectJumperController', ctrl);

    function ctrl($rootScope, $scope, $modalInstance, $filter, $state, hotkeys, projects) {
        $scope.projects = projects;
        $scope.search = {query: ''};
        $scope.active = {id: 0};

        $scope.goTo = goTo;
        $scope.getFiltered = getFiltered;
        $scope.setActive = setActive;

        $scope.$watch("search", onFilterChanged, true);

        $rootScope.$broadcast('modal:open');

        $scope.projects.$promise.then(function(){
            if (!$scope.active.id && $scope.projects.length > 0) {
                $scope.active = $scope.projects[0];
            }
        });

        function getFiltered() {
            return $filter('filter')($scope.projects, { $: $scope.search.query });
        }

        function goTo(project){
            $state.go('user.project', {projectId: project.id});
            $modalInstance.dismiss();
        }

        function setActive(entry) {
            $scope.active = entry;
        }

        function onFilterChanged() {
            var filtered = getFiltered();
            var current = _.findIndex(filtered, function(x) {
                return x.id == $scope.active.id;
            });
            if (current == -1 && filtered.length > 0) {
                $scope.active = filtered[0];
            }
        }

        hotkeys.add({
            combo: 'up',
            allowIn: ['input'],
            callback: function(event) {
                event.preventDefault();
                var current = _.findIndex(getFiltered(), function(x) {
                    return x.id == $scope.active.id;
                });

                var previous = getFiltered()[current - 1];
                if (previous) {
                    $scope.active = previous;
                    scrollTo();
                }
            }
        });

        hotkeys.add({
            combo: 'down',
            allowIn: ['input'],
            callback: function(event) {
                event.preventDefault();
                var current = _.findIndex(getFiltered(), function(x) {
                    return x.id == $scope.active.id;
                });

                var next = getFiltered()[current + 1];
                if (next) {
                    $scope.active = next;
                    scrollTo();
                }
            }
        });

        hotkeys.add({
            combo: 'return',
            allowIn: ['input'],
            callback: function(event) {
                event.preventDefault();
                if ($scope.active.id) {
                    goTo($scope.active);
                }
            }
        });

        $scope.$on('$destroy', function() {
            hotkeys.del('return');
            hotkeys.del('up');
            hotkeys.del('down');

            $rootScope.$broadcast('modal:close');
        });

        function scrollTo() {
            document.getElementById('pj-'+$scope.active.id).scrollIntoViewIfNeeded();
        }
    }
})();


(function() {
    angular
        .module('xApp')
        .controller('ModalUpdateProjectController', ctrl);

    function ctrl($scope, $modalInstance, Api, project) {
        $scope.project = project;

        $scope.ok = function() {
            Api.project.update(
                $scope.project,
                function() {
                    $modalInstance.close($scope.project);
                }
            );
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ProjectController', controller);

    function controller($scope, $modal, Api, $filter, projects, active, hotkeys, $state) {

        $scope.projects = projects;
        $scope.active = {id: active};
        $scope.search = {query: ''};

        $scope.create = createProject;
        $scope.delete = deleteProject;
        $scope.getFiltered = getFiltered;
        $scope.setActive = setActive;
        $scope.goTo = goTo;

        $scope.$watch("search", onFilterChanged, true);

        $scope.$on('$destroy', unbindShortcuts);
        $scope.$on('modal:open', unbindShortcuts);
        $scope.$on('modal:close', bindShortcuts);

        bindShortcuts();

        $scope.projects.$promise.then(function(){
            if (!$scope.active.id && $scope.projects.length > 0) {
                $scope.active = $scope.projects[0];
            }
        });

        function onFilterChanged() {
            var filtered = getFiltered();
            var current = _.findIndex(filtered, function(x) {
                return x.id == $scope.active.id;
            });
            if (current == -1 && filtered.length > 0) {
                $scope.active = filtered[0];
            }
        }

        function createProject() {
            $modal.open({
                templateUrl: 'project/form.html',
                controller: 'ModalCreateProjectController'
            }).result.then(function (model) {
                $scope.projects.push(model);
            });
        }

        function deleteProject(project) {
            if (!confirm('Are you sure?')) {
                return;
            }

            Api.project.delete({id: project.id});
            $scope.projects.splice($scope.projects.map(function (i) {return i.id;}).indexOf(project.id), 1);
        }

        function getFiltered() {
            return $filter('filter')($scope.projects, { $: $scope.search.query });
        }

        function setActive(entry) {
            $scope.active = entry;
        }

        function goTo(project){
            $state.go('user.project', {projectId: project.id});
        }

        function bindShortcuts() {
            hotkeys.add({
                combo: 'up',
                description: 'Show project jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    var current = _.findIndex(getFiltered(), function(x) {
                        return x.id == $scope.active.id;
                    });

                    var previous = getFiltered()[current - 1];
                    if (previous) {
                        $scope.active = previous;
                        scrollTo();
                    }
                }
            });

            hotkeys.add({
                combo: 'down',
                description: 'Show project jump window',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    var current = _.findIndex(getFiltered(), function(x) {
                        return x.id == $scope.active.id;
                    });

                    var next = getFiltered()[current + 1];
                    if (next) {
                        $scope.active = next;
                        scrollTo();
                    }
                }
            });

            hotkeys.add({
                combo: 'return',
                description: 'Open project',
                allowIn: ['input', 'select', 'textarea'],
                callback: function(event) {
                    event.preventDefault();
                    $state.go("user.project", {projectId: $scope.active.id});
                }
            });
        }

        function unbindShortcuts() {
            hotkeys.del('return');
            hotkeys.del('up');
            hotkeys.del('down');
        }

        function scrollTo() {
            document.getElementById('p-'+$scope.active.id).scrollIntoViewIfNeeded();
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ProjectTeamController', teamController);

    function teamController($scope, Api, teams, project, access) {
        $scope.teams = teams;
        $scope.access = access;
        $scope.project = project;

        $scope.canAccess = function(team) {
            return getAccessIndexForUserId(team.id) != -1;
        };

        $scope.grant = function(team) {
            Api.projectTeams.save({
                team_id: team.id,
                project_id: $scope.project.id
            }, function (response) {
                $scope.access.push(response);
            });
        };

        $scope.revoke = function(team) {
            var accessIndex = getAccessIndexForUserId(team.id);

            Api.projectTeams.delete({
                id: $scope.access[accessIndex].id
            }, function() {
                $scope.access.splice(accessIndex, 1);
            });
        };

        function getAccessIndexForUserId(teamId) {
            return $scope.access.map(function (e) { return e.team_id; }).indexOf(teamId);
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('createTeamController', createTeamController);

    function createTeamController($scope, $modalInstance, Api) {
        $scope.team = {};

        $scope.ok = save;
        $scope.cancel = cancel;

        function save() {
            Api.team.save($scope.team, function(response) {
                $modalInstance.close(response);
            });
        }

        function cancel() {
            $modalInstance.dismiss();
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('TeamListController', teamListController);

    function teamListController($rootScope, $scope, $modal, $filter, Api, toaster, teams) {
        $scope.teams = teams;

        $scope.create = create;
        $scope.update = update;
        $scope.remove = remove;
        $scope.members = members;

        $rootScope.$on('teamMemberAdded', onTeamMemberAdded);
        $rootScope.$on('teamMemberRemoved', onTeamMemberRemoved);

        function create() {
            $modal.open({
                templateUrl: 'team/form.html',
                controller: 'createTeamController'
            }).result.then(function (model) {
                $scope.teams.push(model);
            });
        };

        function update(teamId) {
            $modal.open({
                templateUrl: 'team/form.html',
                controller: 'updateTeamController',
                resolve: {
                    team: function(Api) {
                        return Api.team.get({id: teamId});
                    }
                }
            }).result.then(function (model) {
                $scope.teams[$scope.teams.map(function(e) {return e.id}).indexOf(teamId)] = model;
            });
        };

        function remove(teamId) {
            if (!confirm('Are you sure?')) {
                return;
            }
            Api.team.delete({id: teamId}, function() {
                var teamIndex = $scope.teams.map(function(e) {return e.id}).indexOf(teamId);
                toaster.pop('info', "Team Deleted", 'Team "' + $scope.teams[teamIndex].name + '" has been deleted.');
                $scope.teams.splice(teamIndex, 1);
            });
        };

        function members(teamId) {
            $modal.open({
                templateUrl: 'team/members.html',
                controller: 'teamMembersController',
                resolve: {
                    users: function(Api) {
                        return Api.user.query();
                    },
                    access: function(Api) {
                        return Api.teamMembers.query({id: teamId});
                    },
                    team: function() {
                        return $scope.teams[$scope.teams.map(function(c) {return c.id}).indexOf(teamId)];
                    }
                }
            });
        };

        function onTeamMemberAdded(event, data) {
            $scope.teams[$scope.teams.indexOf(data.team)].users.push(data.member);
        }

        function onTeamMemberRemoved(event, data) {
            var teamIndex = $scope.teams.indexOf(data.team);
            var users = $scope.teams[teamIndex].users;
            users.splice(users.map(function (e) { return e.id; }).indexOf(data.userId), 1);
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('teamMembersController', controller);

    function controller($rootScope, $scope, Api, users, access, team) {
        $scope.users = users;
        $scope.access = access;
        $scope.team = team;

        $scope.users.$promise.then(removeOwnerFromList);

        $scope.canAccess = function(user) {
            return getAccessIndexForUserId(user.id) != -1;
        };

        $scope.grant = function(user) {
            Api.teamMembers.save({
                user_id: user.id,
                id: $scope.team.id
            }, function(response) {
                $scope.access.push(response);
                $rootScope.$broadcast('teamMemberAdded', {member: user, team: $scope.team});
            });
        };

        $scope.revoke = function(user) {
            var accessIndex = getAccessIndexForUserId(user.id);

            Api.teamMembers.delete({
                id: $scope.access[accessIndex].id
            }, function () {
                $scope.access.splice(accessIndex, 1);
                $rootScope.$broadcast('teamMemberRemoved', {userId: user.id, team: $scope.team});
            });
        };

        function getAccessIndexForUserId(userId) {
            return $scope.access.map(function (e) { return e.user_id; }).indexOf(userId);
        }

        function removeOwnerFromList() {
            $scope.users.splice(
                $scope.users.map(function (e) { return e.id; }).indexOf($scope.team.user_id),
                1
            );
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('updateTeamController', updateTeamController);

    function updateTeamController($scope, $modalInstance, Api, team) {
        $scope.team = team;

        $scope.ok = update;
        $scope.cancel = cancel;

        function update() {
            Api.team.update($scope.team, function() {
                $modalInstance.close($scope.team);
            });
        }

        function cancel() {
            $modalInstance.dismiss();
        }
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ModalCreateUserController', ctrl);

    function ctrl($scope, $modalInstance, Api, user, GROUPS) {
        $scope.user = user;
        $scope.groups = GROUPS;

        $scope.ok = function () {
            Api.user.save($scope.user,
                function(response) {
                    $modalInstance.close(response);
                }
            );
        };

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ModalUpdateUserController', ctrl);

    function ctrl($scope, $modalInstance, Api, user, GROUPS) {
        $scope.user = user;
        $scope.groups = GROUPS;

        $scope.ok = function () {
            Api.user.update($scope.user,
                function() {
                    $modalInstance.close($scope.user);
                }
            );
        };

        $scope.cancel = function () {
            $modalInstance.dismiss('cancel');
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('ProfileController', ctrl);

    function ctrl($scope, $modalInstance, $location, toaster, Api, AuthFactory) {
        $scope.profile = {
            old: '',
            new: '',
            repeat: ''
        };

        $scope.ok = function() {
            Api.profile.save($scope.profile,
                function() {
                    toaster.pop('success', 'Password successfully changed!', "Please log in using new password.");
                    $modalInstance.close();
                    AuthFactory.logout();
                    $location.path('/login');
                }
            );
        };
    }
})();

(function() {
    angular
        .module('xApp')
        .controller('UserListController', controller);

    function controller($scope, $modal, users) {
        $scope.users = users;

        $scope.createUser = function() {
            var modalInstance = $modal.open({
                templateUrl: 'user/create.html',
                controller: 'ModalCreateUserController',
                resolve: {
                    user: function() {
                        return {$resolved: true};
                    }
                }
            });

            modalInstance.result.then(function (model) {
                $scope.users.push(model);
            });
        };

        $scope.updateUser = function(userId) {
            var modalInstance = $modal.open({
                templateUrl: 'user/create.html',
                controller: 'ModalUpdateUserController',
                resolve: {
                    user: function(Api) {
                        return Api.user.get({id: userId});
                    }
                }
            });

            modalInstance.result.then(function (model) {
                $scope.users[$scope.users.map(function(e) {return e.id}).indexOf(userId)] = model;
            });
        };
    }
})();
