(function(){

	function _isString(obj){
		return type = typeof obj === 'string';
	}

	// from jQuery isNumeric
	function _isNumeric(obj){
		var type = typeof obj;
		return ( type === 'number' || type === 'string' ) && !isNaN( obj - parseFloat( obj ) );
	}

	function _likeArray(obj){
		return typeof obj === 'object' && _isNumeric(obj.length);
	}

	function _isElement(obj) {
		return obj instanceof HTMLElement;
	}

	var boxTpl = (function(){/*
	<div class="mapui-root">
		<div class="mapui-overlay"></div>
		<div class="mapui-box">
			<div class="mapui-box-header">
				<button type="button" class="mapui-box-closebtn"></button>
				<div class="mapui-box-search">
					<button type="button" class="mapui-box-search-btn"></button>
					<div class="mapui-box-search-inputwrap">
						<input type="text" class="mapui-box-search-input" placeholder="キーワードで位置を検索">
					</div>
				</div>
			</div>
			<div class="mapui-box-body">
				<div class="mapui-box-map"></div>
				<div class="mapui-box-center"></div>
			</div>
			<div class="mapui-box-footer">
				<div class="mapui-box-latlng">
					<div class="mapui-box-latlng-lat"></div>
					<div class="mapui-box-latlng-lng"></div>
				</div>
				<button type="button" class="mapui-box-submitbtn">この位置に設定</button>
			</div>
		</div>
	</div>
	*/}).toString().split('\n').slice(1, -1).join('\n');

	function Mapui(){
		this.initialize();
	}


	// 初期化
	Mapui.prototype.initialize = function(){

		this.defaultLat = 34.975556;
		this.defaultLng = 138.382778;

		this.defaultMapOptions = {
			mapTypeId: google.maps.MapTypeId.ROADMAP,
			zoom: 15,
			zoomControl: true,
			mapTypeControl: false,
			streetViewControl: false,
			scrollwheel: true,
		};

		this.isOpened = false;
		this.callback = null;

		this.map = null;
		this.mapPoiInfoWindow = null;
		this.geocoder = null;

		// html
		var el = document.createElement('div');
		el.innerHTML = boxTpl;
		this.$root = el.querySelector('.mapui-root');
		this.$overlay = el.querySelector('.mapui-overlay');
		this.$closeBtn = el.querySelector('.mapui-box-closebtn');
		this.$searchBtn = el.querySelector('.mapui-box-search-btn');
		this.$searchInput = el.querySelector('.mapui-box-search-input');
		this.$map = el.querySelector('.mapui-box-map');
		this.$center = el.querySelector('.mapui-box-center');
		this.$lat = el.querySelector('.mapui-box-latlng-lat');
		this.$lng = el.querySelector('.mapui-box-latlng-lng');
		this.$submitBtn = el.querySelector('.mapui-box-submitbtn');

		// 閉じる、submit
		this.$overlay.addEventListener('click', this.close.bind(this));
		this.$closeBtn.addEventListener('click', this.close.bind(this));
		this.$submitBtn.addEventListener('click', this.submit.bind(this));

		// 検索
		this.$searchBtn.addEventListener('click', this.searchByKeyword.bind(this));
		this.$searchInput.addEventListener('keypress', (function(evt){
			if ( evt.keyCode === 13 && !evt.shiftKey ) {
				this.searchByKeyword();
			}
		}).bind(this));

		// キー操作
		document.addEventListener('keydown', (function(evt){
			if ( this.isOpened ) {
				if (evt.keyCode === 13 ) { // enter
					if ( (' ' + evt.target.className + ' ').indexOf(' mapui-box-search-input ') === -1 || evt.shiftKey ) {
						this.submit();
					}
				} else if (evt.keyCode === 27) { // esc
					this.close();
				}
			}
		}).bind(this));

		this.$root.style.display = 'none';
		this.$map.style.opacity = '0';
		this.$center.style.opacity = '0';

		if ( document.body ) {
			document.body.appendChild(this.$root);
		} else {
			document.addEventListener('DOMContentLoaded', (function(){
				document.body.appendChild(this.$root);
			}).bind(this));
		}
	};


	Mapui.prototype.initializeMap = function(mapOptions){

		this.map = new google.maps.Map(this.$map, mapOptions);

		// 緯度経度の更新
		var updateLatLng = (function(){
			// lat between -90 and 90, lng between -180 and 180
			// http://stackoverflow.com/questions/7680371/map-getcenter-lng-extends-beyond-180-when-dragging-continuously-how-can-i-st
			var center = this.map.getCenter();
			var realCenter = new google.maps.LatLng(center.lat(), center.lng());
			this.$lat.textContent = realCenter.lat();
			this.$lng.textContent = realCenter.lng();
		}).bind(this);
		this.map.addListener('center_changed', updateLatLng);
		updateLatLng();

		// ダブルクリックの位置に移動
		this.map.addListener('dblclick', (function(evt){
			this.map.setCenter(evt.latLng);
		}).bind(this));

		// クリックしたPOIの位置に移動
		var setMapPoiInfoWindow = (function(infoWindow){
			var movedPos = null;
			this.mapPoiInfoWindow = infoWindow;

			var move = (function(){
				var pos = infoWindow.getPosition();
				if ( pos.equals(movedPos) ){
					return;
				}
				movedPos = pos;
				this.map.panTo(pos);
				// console.log(1);
			}).bind(this);

			var moveHandle = google.maps.event.addListener(infoWindow, 'position_changed', move);
			move();

			var closeHandle = google.maps.event.addListener(infoWindow, 'closeclick', function(){
				google.maps.event.removeListener(moveHandle);
				google.maps.event.removeListener(closeHandle);
				this.mapPoiInfoWindow = null;
			});
		}).bind(this);

		(function(myMapElem) {
			var set = google.maps.InfoWindow.prototype.set;
			google.maps.InfoWindow.prototype.set = function(key, val) {
				set.apply(this, arguments);
				if ( key === 'map' && val && val.getDiv() === myMapElem ) {
					setMapPoiInfoWindow(this);
				}
			};
		})(this.$map);

		this.geocoder = new google.maps.Geocoder();
	};


	/*
	 lat, lng, zoom, callback[, mapOptions]
	 lat, lng, callback[, mapOptions]
	 callback[, mapOptions]
	*/
	Mapui.prototype.open = function(lat, lng, zoom, callback, mapOptions){

		// arguments
		if ( typeof callback === 'function' ) { // lat, lng, zoom, callback[, mapOptions]
			this.callback = callback;
			mapOptions = mapOptions || {};
			mapOptions.zoom = zoom;
		}
		else if ( typeof zoom === 'function' ) { // lat, lng, callback[, mapOptions]
			this.callback = zoom;
			mapOptions = callback || {};
		}
		else if ( typeof lat === 'function' ) { // callback[, mapOptions]
			this.callback = lat;
			mapOptions = lng || {};
		}
		else if ( _isNumeric(lat) && _isNumeric(lng) ) {
			if ( _isNumeric(zoom) ) {
				mapOptions = callback || {};
			} else {
				mapOptions = zoom || {};
			}
		} else {
			mapOptions = lat || {};
			lat = lng = null;
		}

		Object.keys(this.defaultMapOptions).forEach( (function(key) {
			if ( !mapOptions.hasOwnProperty(key) ) {
				mapOptions[key] = this.defaultMapOptions[key];
			}
		}).bind(this));

		if ( !_isNumeric(lat)|| !_isNumeric(lng) ) {
			lat = this.defaultLat;
			lng = this.defaultLng;
		}
		mapOptions.center = new google.maps.LatLng(lat, lng);

		if ( !this.isOpened ) {
			this.$root.style.display = 'block';
			this.isOpened = true;
		}

		if ( this.map ) {
			this.map.setOptions(mapOptions);
		} else {
			this.initializeMap(mapOptions);
		}

		setTimeout((function(){
			this.$map.style.opacity ='1';
			this.$center.style.opacity ='1';
		}).bind(this), 100);
	};


	Mapui.prototype.close = function(){
		if ( !this.isOpened ) {
			return;
		}
		this.isOpened = false;
		this.callback = null;
		if ( this.mapPoiInfoWindow ) {
			this.mapPoiInfoWindow.close();
			google.maps.event.trigger(this.mapPoiInfoWindow, 'closeclick');
		}
		this.$root.style.display = 'none';
		this.$searchInput.value = '';
		this.$map.style.opacity = '0';
		this.$center.style.opacity = '0';
	};


	Mapui.prototype.submit = function(lat, lng){
		if ( !this.isOpened ) {
			return;
		}
		if ( !lat || !lng ) {
			// lat between -90 and 90, lng between -180 and 180
			// http://stackoverflow.com/questions/7680371/map-getcenter-lng-extends-beyond-180-when-dragging-continuously-how-can-i-st
			var center = this.map.getCenter();
			var realCenter = new google.maps.LatLng(center.lat(), center.lng());
			lat = realCenter.lat();
			lng = realCenter.lng();
		}
		if ( this.callback ) {
			this.callback(lat, lng, this.map.getZoom());
		}
		this.close();
	};


	Mapui.prototype.searchByKeyword = function(keyword){
		if ( !this.isOpened ) {
			return;
		}
		keyword = keyword || this.$searchInput.value;
		if ( keyword === '' ) {
			return;
		}
		if ( this.isSearching ) {
			return;
		}
		this.isSearching = true;
		this.$searchBtn.disabled = true;

		this.geocoder.geocode({
			address: keyword,
			// region: 'JP'
		}, (function(results, status) {
			this.isSearching = false;
			this.$searchBtn.disabled = false;
			if (status === google.maps.GeocoderStatus.OK) {
				var latlng = results[0].geometry.location;
				if ( latlng ) {
					this.map.panTo(latlng);
					return;
				}
			}
			alert('緯度経度を取得できませんでした');
		}).bind(this));
	};


	Mapui.prototype.input = function(input, lat, lng, zoom, callback, mapOptions){

		// input
		if ( typeof input === 'object' && input.length === 2 ) {
			if ( typeof input[0] === 'string' ) {
				input[0] = document.querySelector(input[0]);
			}
			if ( typeof input[1] === 'string' ) {
				input[1] = document.querySelector(input[1]);
			}
		} else {
			input = [input];
			if ( typeof input[0] === 'string' ) {
				input[0] = document.querySelector(input[0]);
			}
		}

		// other arguments
		if ( typeof callback === 'function' ) { // lat, lng, zoom, callback[, mapOptions]
			callback = callback;
			mapOptions = mapOptions || {};
			mapOptions.zoom = zoom;
		}
		else if ( typeof zoom === 'function' ) { // lat, lng, callback[, mapOptions]
			callback = zoom;
			mapOptions = callback || {};
		}
		else if ( typeof lat === 'function' ) { // callback[, mapOptions]
			callback = lat;
			mapOptions = lng || {};
		}
		else if ( _isNumeric(lat) && _isNumeric(lng) ) {
			if ( _isNumeric(zoom) ) {
				mapOptions = callback || {};
				mapOptions.zoom = zoom;
			} else {
				mapOptions = zoom || {};
			}
		} else {
			mapOptions = lat || {};
			lat = lng = null;
		}

		var _callback = callback;
		callback = function(lat, lng, zoom){
			if ( input.length === 1 ) {
				input[0].value = lat + ',' + lng;
			} else if ( input.length === 2 ) {
				input[0].value = lat;
				input[1].value = lng;
			}
			prevZoom = zoom;

			if ( _callback ) {
				_callback(lat, lng, zoom);
			}
		};

		var prevZoom = null;

		var forcusHandle = (function(evt){
			if ( input.length === 1 ) {
				var matched = input[0].value.replace(/\s/g, '').match(/^(\-?\d{1,2}(?:\.\d+)?)\,(\-?\d{1,3}(?:\.\d+)?)$/);
				if ( matched ) {
					lat = matched[1] - 0;
					lng = matched[2] - 0;
				}
			} else if ( input.length === 2 ) {
				var matched0 = input[0].value.replace(/\s/g, '').match(/^\-?\d{1,2}(?:\.\d+)?$/);
				var matched1 = input[1].value.replace(/\s/g, '').match(/^\-?\d{1,3}(?:\.\d+)?$/);
				if ( matched0 && matched1 ) {
					lat = matched0[0] - 0;
					lng = matched1[0] - 0;
				}
			}
			if ( prevZoom ) {
				mapOptions.zoom = prevZoom;
			}
			evt.target.blur();
			this.open(lat, lng, callback, mapOptions);
		}).bind(this);

		input[0].addEventListener('focus', forcusHandle);
		if( input[1] ) input[1].addEventListener('focus', forcusHandle);
	};

	Mapui.prototype.killInput = function(input){
		if ( typeof input === 'object' && input.length === 2 ) {
			if ( typeof input[0] === 'string' ) {
				input[0] = document.querySelector(input[0]);
			}
			if ( typeof input[1] === 'string' ) {
				input[1] = document.querySelector(input[1]);
			}
		} else {
			input = [input];
			if ( typeof input[0] === 'string' ) {
				input[0] = document.querySelector(input[0]);
			}
		}
		input[0].removeEventListener('focus', forcusHandle);
		if ( input[1] ) input[1].removeEventListener('focus', forcusHandle);
	};

	window.mapui = new Mapui();

})();