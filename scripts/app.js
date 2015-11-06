'use strict';

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var Delivia = (function () {
    function Delivia(params) {
        _classCallCheck(this, Delivia);

        var defaults = {};
        this.settings = _.extend(defaults, params);
        this.dom = {};

        this.searchPath = this.settings.apiUrl + '/companies/' + this.settings.companyId + '/services/search';

        this.init();
    }

    Delivia.prototype.init = function init() {
        var self = this;

        this.initTemplates();
        ymaps.ready(self.initMap.bind(self));

        this.getObjects().then(function (data) {
            //console.log('getObjects callback', data)
            self.prepareObjects(data);

            ymaps.ready(self.initMapObjects.bind(self));

            $(document).ready(function () {
                self.initSidebar();
                self.initFilters();
            });
        });
    };

    Delivia.prototype.prepareObjects = function prepareObjects(data) {
        //console.log('prepareObjects', data)
        var self = this;
        for (var i = 0, l = data.length; i < l; i++) {
            data[i].id = i;
        }
        this.objects = data;
    };

    Delivia.prototype.initTemplates = function initTemplates() {
        this.templates = {};
        this.templates.sideObj = '<div class="point js-side-obj" id="side-obj-<%- id %>" data-id="<%- id %>">\n                <span class="point__addr"><%= delivery.place.address.string %></span>\n                <span class="point__carrier">(<%- carrier.name %>)</span>\n                <br>\n                <% if(fitting) { %> <span class="point__fitting">с примеркой</span> <% } %>\n                <% if(fulltime) { %> <span class="point__fulltime">24/7</span> <% } %>\n                <% if(card) { %> <span class="point__card">возможна оплата картой</span> <% } %>\n                <br>\n                <span class="point__time">\n                    <% if (typeof(relativeDay) !== "undefined") { %>\n                        <%= relativeDay %>,\n                    <% } %>\n                    <% if (typeof(date) !== "undefined") { %>\n                        <%- date %>\n                    <% } %>\n                    <% if (typeof(day) !== "undefined") { %>\n                        (<%- day %>)\n                    <% } %>\n                </span>\n                <% if (cost) { %>\n                    <span class="point__price"><%- cost %> р.</span>\n                <% } %>\n            </div>';

        this.templates.carrier = '<div class="input-group checkbox">\n                <label>\n                    <input type="checkbox" checked="checked" class="js-filter" data-model="carriers.<%- id %>">\n                    <%- name %>\n                </label>\n            </div>';

        this.templates.balloon = '<div class="balloon">\n                <header>ПВЗ <%- carrier.name %></header>\n                <div class="addr"><%- delivery.place.address.string %></div>\n\n                <%- cost %>\n            </div>';
        //<% if () { %> <% } %>
    };

    Delivia.prototype.initSidebar = function initSidebar() {
        this.dom.sidebar = $('.js-side-objects');
        var template = _.template(this.templates.sideObj);
        var result = '';
        for (var i = 0, l = this.objects.length; i < l; i++) {
            result = result + template(this.objects[i]);
        }
        this.dom.sidebar.html(result);

        this.attachSidebarEventHandlers();
    };

    Delivia.prototype.initMap = function initMap() {
        this.map = new ymaps.Map("map", {
            center: [55.76, 37.64],
            zoom: 11
        });
    };

    Delivia.prototype.initMapObjects = function initMapObjects() {
        var self = this;
        this.placemarks = new ymaps.GeoObjectCollection();

        var balloonTemplate = _.template(self.templates.balloon);

        for (var i = 0, l = this.objects.length; i < l; i++) {
            var obj = this.objects[i];
            var pm = new ymaps.Placemark(obj.delivery.place.address.geo, {
                content: 'Москва!',
                balloonContent: balloonTemplate(obj),
                carrierName: obj.carrier.name,
                carrierid: obj.carrier.id,
                id: obj.id.toString()
            });
            this.placemarks.add(pm);
        }

        this.geoQueryObjects = ymaps.geoQuery(this.placemarks);
        this.clusterer = this.geoQueryObjects.clusterize();
        this.map.geoObjects.add(this.clusterer);

        this.attachMapEventHandlers();
    };

    Delivia.prototype.initFilters = function initFilters() {
        var self = this;
        this.filter = {
            card: false,
            fitting: false,
            fulltime: false,
            carriers: {
                iml: true,
                qiwipost: true,
                pickpoint: true
            }
        };
        this.initCarriers();
        this.dom.filters = $('.js-filters');
        this.dom.filters.on('change', '.js-filter', function () {
            self.applyFilter($(this).data('model'), $(this).is(':checked'));
        });
    };

    Delivia.prototype.applyFilter = function applyFilter(filterName, filterValue) {
        var filterNamePath = filterName.split('.');
        var filter = filterNamePath.length == 1 ? this.filter : this.filter[filterNamePath[0]];

        filter[_.last(filterNamePath)] = filterValue;

        //this.filterPlacemarks()
        this.filterObjects();
    };

    /**
     * перебирает все объекты, сравнивает их с фильтром
     * если удовлетворяет условию, id кладет в this.filteredObjectsIds
     *
     * на больших объемах может будет тормозить, надо будет оптимизировать
     * и искать не по всем объектам, а только по уже отфильтрованным
     */

    Delivia.prototype.filterObjects = function filterObjects() {
        this.filteredObjectsIds = [];

        _.forEach(this.objects, function (obj) {
            var satisfied = true;

            // перебираем все поля в фильтре
            _.forEach(this.filter, function (value, key) {
                // если поле тру, а у объекта фолс - объект исключаем
                if (value === true && !obj[key]) {
                    satisfied = false;
                }

                // курьерки смотрим отдельно
                // хотя, наверное, можно как-то зарекурсить и смотреть их вместе с остальными фильтрами
                if (key == 'carriers') {
                    _.forEach(this.filter.carriers, function (carrierValue, carrier) {
                        if (!carrierValue && obj.carrier.id == carrier) {
                            satisfied = false;
                        }
                    });
                }
            }, this);

            if (satisfied) {
                this.filteredObjectsIds.push(obj.id);
            }
        }, this);

        this.filterSideObjects();
        this.filterPlacemarks();
    };

    Delivia.prototype.filterPlacemarks = function filterPlacemarks() {
        var self = this;

        var regString = '^' + this.filteredObjectsIds.join('|') + '$';
        var foundMarks = self.geoQueryObjects.search('properties.id rlike "' + regString + '"');

        //self.geoObjects.removeFromMap(this.map)
        foundMarks.addToMap(this.map);
        this.clusterer.removeAll();
        this.clusterer = foundMarks.clusterize();
        this.map.geoObjects.add(this.clusterer);
    };

    Delivia.prototype.initCarriers = function initCarriers() {
        this.dom.carriers = $('.js-carriers');
        this.carriers = Delivia.emulation.generateCarriers();

        var template = _.template(this.templates.carrier);
        var result = '';
        for (var i = 0, l = this.carriers.length; i < l; i++) {
            result = result + template(this.carriers[i]);
        }
        this.dom.carriers.html(result);
    };

    Delivia.prototype.attachMapEventHandlers = function attachMapEventHandlers() {
        var self = this;

        this.geoQueryObjects.addEvents('click', function (e) {
            var id = e.get('target').properties.get('id');
            self.activateSideObj(id);
        });

        this.map.events.add('balloonclose', function () {
            self.deactivateSideObj();
        });
    };

    Delivia.prototype.deactivateSideObj = function deactivateSideObj() {
        this.dom.sidebar.find('.active').removeClass('active');
    };

    Delivia.prototype.activateSideObj = function activateSideObj(id) {
        this.deactivateSideObj();
        var elem = this.dom.sidebar.find('#side-obj-' + id);
        elem.addClass('active');

        var top = elem.position().top - 150;
        this.dom.sidebar.animate({ scrollTop: top }, 200);
    };

    Delivia.prototype.activatePlacemark = function activatePlacemark(id) {
        var pm = this.geoQueryObjects.search('properties.id == ' + id).get(0);
        var coords = pm.geometry.getCoordinates();
        this.map.setCenter(coords);
        this.map.setZoom(17).then(function () {
            pm.balloon.open();
        });
    };

    Delivia.prototype.attachSidebarEventHandlers = function attachSidebarEventHandlers() {
        var self = this;
        this.dom.sidebar.on('click', '.js-side-obj', function (e) {
            var id = $(e.currentTarget).data('id');
            self.activateSideObj(id);
            self.activatePlacemark(id);
        });
    };

    Delivia.prototype.filterSideObjects = function filterSideObjects(ids) {
        ids = ids ? ids : this.filteredObjectsIds;
        var s = '#side-obj-' + ids.join(', #side-obj-');
        this.dom.sidebar.children().hide();
        this.dom.sidebar.find(s).show();
    };

    Delivia.prototype.buildSearchQuery = function buildSearchQuery() {
        return {
            "parcels": [{
                "length": 0,
                "width": 0,
                "height": 0,
                "weight": 0,
                "price": 0,
                "insurance": 0
            }],
            "collect": {
                "place": {
                    "id": "string"
                },
                "date": Delivia.utils.getDate()
            },
            "delivery": {
                "type": "pickup",
                "place": {
                    "id": "string",
                    "address": {
                        "aoguid": " 0c5b2444-70a0-4932-980c-b4dc0d3f02b5",
                        "houseguid": "5d83ad09-1fc0-4967-9cd6-068bd3f1aeaa"
                    }
                },
                "from_date": Delivia.utils.getDate(),
                "to_date": Delivia.utils.getDate({ daysOffset: 2 })
            },
            "payment": {
                "type": "cash"
            },
            "partial": {}
        };
    };

    Delivia.prototype.getObjects = function getObjects() {
        console.log('getObjects');

        //let self = this;
        //return $.ajax({
        //    type: 'POST',
        //    url: self.searchPath,
        //    data: JSON.stringify(self.buildSearchQuery()),
        //    contentType: "application/json;charset=utf-8",
        //    dataType: 'json',
        //    headers: {
        //        Authorization: 'ApiKey dfeb55fcd9579a58ff7c1f43056257d3'
        //    }
        //}).then(
        //    (data) => {
        //        return data
        //    }, (error) => {
        //        console.log(error)
        //    }
        //)

        var def = jQuery.Deferred();
        def.resolve(Delivia.emulation.generatePointObjects());
        return def.promise();
    };

    return Delivia;
})();

Delivia.emulation = {
    generatePointObject: function generatePointObject(params) {
        var val = function val(param, defaultValue) {
            return params[param] ? params[param] : defaultValue;
        };

        var timetable = function timetable() {
            var always = {
                always: [{
                    begin: "00.00",
                    end: "23.59"
                }]
            };
            var normal = {
                workdays: [{
                    begin: "10.00",
                    end: "20.00"
                }]
            };

            var result = undefined;

            if (params.timetable) {
                if (params.timetable == 'always') {
                    result = always;
                } else if (params.timetable == 'normal') {
                    result = normal;
                } else {
                    result = params.timetable;
                }
            } else {
                result = always;
            }

            return result;
        };

        return {
            carrier: {
                name: params.carrier_name ? params.carrier_name : 'QiwiPost',
                id: params.carrier_id ? params.carrier_id : 'qiwipost'
            },
            delivery: {
                type: "pickup",
                place: {
                    id: "string",
                    description: val('place_description', null),
                    address: {
                        geo: params.geo ? params.geo : [55.76, 37.64],
                        string: val('addr', null),
                        aoguid: "string",
                        houseguid: "string"
                    }
                },
                timetable: timetable()
            },
            payment: {
                // предполагаю, что оплата наличкой есть везде по умолчанию
                types: val('payment', null)
            },
            partial: {},
            cost: val('cost', 0),
            min_days: 0,
            max_days: 0,
            fitting: val('fitting', false),
            fulltime: val('fulltime', false),
            card: val('card', false)
        };
    },

    generatePointObjects: function generatePointObjects() {
        var objParams = [{
            addr: 'переулок Сивцев Вражек, 20',
            geo: [55.747961, 37.594108],
            card: true,
            cost: 300,
            fulltime: true
        }, {
            addr: '5-я Кожуховская улица, 18к2',
            geo: [55.704404, 37.674490],
            carrier_id: "iml",
            carrier_name: "IML",
            cost: 500,
            fitting: true
        }, {
            addr: 'улица Коровий Вал, 7с1',
            geo: [55.728677, 37.617421],
            carrier_id: "pickpoint",
            carrier_name: "PickPoint",
            fulltime: true
        }, {
            addr: 'Малый Лёвшинский переулок, 7с2',
            geo: [55.741734, 37.588003],
            carrier_id: "qiwipost",
            carrier_name: "QiwiPost"
        }, {
            addr: 'Моховая улица, 11к11',
            geo: [55.755789, 37.612878],
            carrier_id: "iml",
            carrier_name: "IML",
            cost: 500,
            fitting: true
        }, {
            addr: 'Мясницкая улица, 39с1',
            geo: [55.767525, 37.641084],
            carrier_id: "pickpoint",
            carrier_name: "PickPoint"
        }, {
            addr: 'Краснопрудная улица, 13',
            geo: [55.780951, 37.666390],
            carrier_id: "qiwipost",
            carrier_name: "QiwiPost"
        }, {
            addr: '2-я Бауманская улица, 5с1',
            geo: [55.765122, 37.683637],
            carrier_id: "pickpoint",
            carrier_name: "PickPoint"
        }, {
            addr: 'Красноказарменная улица, 2с1',
            geo: [55.760789, 37.688554],
            carrier_id: "qiwipost",
            carrier_name: "QiwiPost"
        }];

        var result = [];

        _.each(objParams, function (elem) {
            result.push(Delivia.emulation.generatePointObject(elem));
        });

        return result;
    },

    generateCarriers: function generateCarriers() {
        return [{
            id: 'iml',
            name: 'IML'
        }, {
            id: 'qiwipost',
            name: 'QiwiPost'
        }, {
            id: 'pickpoint',
            name: 'PickPoint'
        }];
    }
};

Delivia.utils = {
    /**
     * Выводит сегодняшнюю дату или дату +-n дней относительно сегодняшней
     * @param {Object} param
     * {Number} param.daysOffset - добавить или отнять n дней от текущей даты
     * @returns {string} возвращает дату в формате yyyy-mm-dd
     */
    getDate: function getDate(param) {
        var daysOffset = param && _.isNumber(param.daysOffset) ? param.day : 0;

        var date = new Date();
        date = daysOffset ? date.setDate(date.getDate() + daysOffset) : date;

        var dd = date.getDate();
        var mm = date.getMonth() + 1;
        var yyyy = date.getFullYear();

        if (dd < 10) dd = '0' + dd;
        if (mm < 10) mm = '0' + mm;

        return yyyy + '-' + mm + '-' + dd;
    },

    arrayToRegexp: function arrayToRegexp(arr) {
        var result = new RegExp('^' + arr.join('|') + '$');
        console.log(result);
        return result;
    }
};

var delivia = new Delivia({
    apiKey: 'dfeb55fcd9579a58ff7c1f43056257d3',
    apiUrl: 'http://192.168.1.76/v1',
    companyId: '1166'
});