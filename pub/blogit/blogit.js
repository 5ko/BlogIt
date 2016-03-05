// blogit.js 2016-02-26 1.7.0
jQuery.noConflict();
jQuery(document).ready(function($){
	//show error messages set by pmwiki in .wikimessage
	//TODO: Hide original message in .wikimessage?
	BlogIt.fn.showMsg({msg:$(BlogIt.pm['skin-classes']['blog-form']+' .wikimessage').html(), result:'error'});
	BlogIt.fn.showMsg({msg:$(BlogIt.pm['skin-classes']['comment-form']+' .wikimessage').html(), result:'success'}); //default to success, since no way to tell if error.

	//for blog entry add class to prevent validations preventing cancel action
	$('#blogit-cancel').addClass('cancel');
	$.validator.addMethod(
		'datetime',
		function(v, e, fmt){
			return this.optional(e) ||	RegExp(BlogIt.fmt['entry-date']).test(v);
		},
		'Must be datetime.'  //TODO: Add format string XL
	);
	BlogIt.fn.validationRules();
	BlogIt.fn.addTagEvents();
	BlogIt.fn.addRequireGroup();

	$(document).on("click", 'a[href*="action\=bi_ca&bi_mode\=ajax"],a[href*="action\=bi_cua&bi_mode\=ajax"]', function(e){  //comment un/approve
		e.preventDefault();
		BlogIt.fn.ajax({ success: function(data){ BlogIt.fn.commentStatus(e.target, data); }}, e);
	});
	//TODO: Change structure to leverage jBox handlers.
	$(document).on("click", 'a[href*="action\=bi_be&bi_mode\=ajax"],a[href*="action\=bi_ne&bi_mode\=ajax"]', function(e){ BlogIt.fn.loadDialog(e,'blog'); });  //blog edit
	$(document).on("click", 'a[href*="action\=bi_del&bi_mode\=ajax"]', function(e){ BlogIt.fn.showDelete(e); });  //delete comments and blogs
	$(document).on("click", 'a[href*="action\=bi_bip"]', function(e){ BlogIt.fn.showBlockIP(e); });  //block comment IP addresses
	$(document).on("click", 'a[href*="action\=bi_ce&bi_mode\=ajax"]', function(e){ BlogIt.fn.loadDialog(e,'comment','edit'); });  //comment edit
	$(document).on("click", 'a[href*="action\=bi_cr&bi_mode\=ajax"]', function(e){ BlogIt.fn.loadDialog(e,'comment','reply'); });  //comment reply (admins)
	$(BlogIt.pm['skin-classes']['blog-form']+' form :input:not(:submit)').on('change', function(){  //if any field (not a submit button) changes...
		$(window).on('beforeunload', function(){return BlogIt.fn.xl('You have unsaved changes.');});
	});
});

var BlogIt={ fmt:{}, xl:{}, fn:{}, pm:{} };
BlogIt.fn = function($){
	//private declarations
	var _unapprove;
	$.ajaxSetup({ timeout: 15000,  //timeout of 15 seconds
		contentType: "application/x-www-form-urlencoded; charset="+BlogIt.pm['charset'],  //NOTE: jquery will always send with UTF8, regardless of charset specified.
		error: function(request,error){
			BlogIt.fn.showMsg({result:'error', msg:(
				(error=='parsererror' ?'Parsing JSON request failed.'
				:(error=='timeout' ?'Request timeout.'
				:'Error: '+error+"\n"+request.readyState+"\nresponseText: "+request.responseText
				))
			)});
		}
	});
	var dialog;  //global dialog reference so we can close from ajaxSubmit()

	function isComment(e){ return e.hasClass( BlogIt.pm['skin-classes']['comment'].replace(/^\./,'') ); }
	function isCommentApproved(e){ return $('a[href*="action\=bi_cua&bi_mode\=ajax"]', e).length > 0; }
	function updateCommentCount(approvedCC, unapprovedCC){
		function updateCC(e, c){
			var e_txt = e.text().replace(/\n/ig, '');  //remove extraneous \n as it messes up the replacing
			var cc = e_txt.match(/\d+/).join('');  //parse out the number from the link text (assume the only number there is the comment count)
			e.text( e_txt.replace(cc, (parseInt(cc)+c)));
		}
		$(BlogIt.pm['skin-classes']['approved-comment-count']).each(function(i,e){ updateCC($(e), approvedCC); });
		$(BlogIt.pm['skin-classes']['unapproved-comment-count']).each(function(i,e){ updateCC($(e), unapprovedCC); });
	}
	//TODO: This or bi_seek?
	function getWrapper(e){ return $(e).closest('[id^="bi_ID"]'); }
	function getSkinClass($e, c){  //return the skin-class of $e
		for (var i=0; ($e.length>0 && i<c.length); i++)  if ($e.bi_seek(c[i]).length > 0)  return c[i];
		return '';
	}
	function getEnteredIP(e){ return e+'&bi_ip='+$("#blogit_ip").val(); };
	function objectRemove(e, data){
		var $old = getWrapper(e);
		//if this is a comment, and if the comment was approved deduct approved-count, else deduct unapproved-comment
		if ( isComment($old) )  (isCommentApproved($old) ?updateCommentCount(-1, 0) :updateCommentCount(0, -1));
		$old.fadeOut(500, function(){ $(this).remove(); });
		BlogIt.fn.showMsg(data);
	};
	//dialog functions
	function dialogWait(clear){
		$('.jBox-title div:not(.jBox-closeButton)').css( clear ?{background:""} :{background: "url( "+ BlogIt.pm.pubdirurl+ "/wait.gif) no-repeat left center", width: "18px", height: "18px"});
	};
	function dialogShow(txt, yes, no, w, ajax, e){
		var prompt=new jBox('Confirm',{
			content: txt,
			_onOpen: function() {  //Override jbox default. Only change is to prevent dialog closing post confirm() so we manually close if form validates.
				this.submitButton.off('click.jBox-Confirm' + this.id).on('click.jBox-Confirm' + this.id, function() { this.options.confirm ? this.options.confirm() : eval(this.source.data('jBox-Confirm-submit')); }.bind(this));
			},
			confirmButton: BlogIt.fn.xl(yes),
			cancelButton: BlogIt.fn.xl(no),
			confirm: function(){ BlogIt.fn.ajax(ajax, e); prompt.close(); },
			onCloseComplete: function () { this.destroy(); },
			width: w, minWidth: w, maxWidth: w  //needed to override jbox default
		}).open();
	};
	//visuals
	function flash($e, data){
		var bg = $e.parent().css('background-color');
		$e.animate(
			{ backgroundColor: '#BBFFB6'},
			{ duration: 750, complete: function(){
				$(this).animate(
					{ backgroundColor: bg },
					{ duration:750, complete: function(){ $(this).css('background-color','') } }
			)}}
		);
		BlogIt.fn.showMsg(data);
	};

	//add this to jquery
	//TODO: Use closest()?
	$.fn.bi_seek = function(seek){
		var $found;
		this.each(function(){
			var $this=jQuery(this);
			$found=$this.find(seek);
			if ($found.length<1)  $found=$this.filter(seek);
			if ($found.length==1)  return false;
		});
		return $found;
	};

//public functions
	return {
		showDelete: function(e){
			e.preventDefault();
			//TODO: yes and no with XL()
			dialogShow(BlogIt.fn.xl('Are you sure you want to delete?'),'Yes','No',300,
				{success:function(data){ objectRemove(e.target, data); }},e);
		},
		showBlockIP: function(e){
			e.preventDefault();
			BlogIt.fn.ajax({
				success: function(data){
					if (data.ip){
						dialogShow(
							BlogIt.fn.xl('Commenter IP: ')+data.ip+'<br/>'+BlogIt.fn.xl('Enter the IP to block:')+
							//TODO: submit, Cancel with XL()
							'<input id="blogit_ip" type="text" value="'+data.ip+'"/>','Submit','Cancel',300,
							{	url: function(e){ return getEnteredIP(e); },
								success: function(data){ BlogIt.fn.showMsg(data); }
							}, e);
					}
				}
			},e);
		},
		commentStatus: function(e, data){
			var $e = getWrapper(e);
			flash($e, data);
			_unapprove = ( $(e).html()==BlogIt.fn.xl('unapprove') );
			e.href = (_unapprove ?e.href.replace('bi_cua', 'bi_ca') :e.href.replace('bi_ca', 'bi_cua'));
			$(e).html(BlogIt.fn.xl( (_unapprove ?'approve' :'unapprove') ));
			$e.removeClass('blogit-comment-' +(!_unapprove ?'un' :'') +'approved').addClass('blogit-comment-' +(_unapprove ?'un' :'') +'approved')
			if (_unapprove)  updateCommentCount(-1,1)
			else  updateCommentCount(1,-1);
		},
		//opens a dialog with content from PmWiki, calls validationRules(), and then on submit calls ajaxForm(), which calls updateBlog/updateComment
		loadDialog: function(e,name,mode){
			console.log('loading dialog: '+name+'::'+mode);
			e.preventDefault();
			$.ajax({dataType:'json', url:e.currentTarget.href,  //get the comment form from pmwiki; not .target, because actual target might be an image wrapped in an anchor
				success: function(data){
					if (data.out){  //form returned in data.out
//TODO: .jBox-Confirm .jBox-content {text-align: left;}
						dialog = new jBox('Confirm', {
							title: '&nbsp',
							content: (name=='blog' ?$(data.out).filter('#wikiedit') :$(data.out)),
							_onOpen: function() {  //Override jbox default. Only change is to prevent dialog closing post confirm() so we manually close if form validates.
								this.submitButton.off('click.jBox-Confirm' + this.id).on('click.jBox-Confirm' + this.id, function() { this.options.confirm ? this.options.confirm() : eval(this.source.data('jBox-Confirm-submit')); }.bind(this));
							},
							closeButton: 'title',
							//TODO: XL()
							confirmButton: 'Submit',
							cancelButton: 'Cancel',
							//TODO: Need to make it specific to the #wikiedit in the jbox dialog
							confirm: function (ev) { $('.jBox-content form').submit(); },
							onCloseComplete: function () { this.destroy(); },
							width: (name=='blog'?750:430),
							minWidth: (name=='blog'?750:430),
							maxWidth: 10000  //needed to override jbox default
						})
						.open();
						BlogIt.fn.addTagEvents();
						BlogIt.fn.validationRules(e,mode);  //adds submit handler for button in dialog
					}
				}
			});
		},
		//defines the ajax actions when clicking Submit from dialogs, and Submit from comment entry
		ajaxForm: function($frm, submitFn, mode, eventTarget){
			dialogWait();
			if (!$('[name="bi_mode"]',$frm).length)  $frm.prepend('<input type="hidden" name="bi_mode" value="ajax">');  //trigger ajax mode

			var $context,containerClass;  //$context is a JQ object we're going to replace; skinClass is used in php.bi_AjaxRedirect to determine which includesection template to use
			if (eventTarget){  //eventTarget is null for user clicking Post button (mode=='add')
				//TODO: why not include comment-list?
				var vc = [BlogIt.pm['skin-classes']['blog-entry'], BlogIt.pm['skin-classes']['comment-admin-list'], BlogIt.pm['skin-classes']['blog-entry-summary'],
					BlogIt.pm['skin-classes']['blog-list-row'], BlogIt.pm['skin-classes']['comment-list']];
				$context = $(eventTarget.target).closest(vc.join(','));
				console.log('context: ');
				console.log($context);
				containerClass = '';  //get the skin class of triggering context which is used to find the pmwiki includesection template (php.bi_AjaxRedirect())
				//element can contain multiple classes. find only the class which is in valid contextx (vc)
				for (var i=0; ($context.length>0 && i<vc.length); i++)  if ($context.bi_seek(vc[i]).length > 0)  { containerClass=vc[i]; break; }
				console.log('new way containerClass: .' +$context.attr('class'));
				console.log('old way containerClass:'+containerClass);
				$('.jBox-content form').prepend('<input type="hidden" name="bi_context" value="'+ containerClass+ '">')  //trigger multi-entry mode
			}
			else console.log('no eventTarget');

			$.ajax({type: 'POST', dataType:'json', url:$frm.attr('action'),
				data: $frm.serialize(),  //NOTE: jquery will always send with UTF8, regardless of charset specified.
				success: function(data){  //after PmForms finishes processing, update page with new content
					console.log('closing');
					//TODO: Check needed, or just close?
					if (!data || (data && data.result!='error'))  if (dialog)  dialog.close();  //TODO: Need more robust check. dialog doesn't exist when submitting comments; why not dialogClose()
					console.log('ajax class:'+containerClass);
					if (data.out)  submitFn(data, mode, $context, containerClass);  //TODO: containerClass not defined from edit comment
					else  BlogIt.fn.showMsg({msg:(data.msg || BlogIt.fn.xl('No data returned.')), result:(data.result || 'error')});
				}
			});
		},

//Routines called from ajaxForm
		validationRules: function(e,mode){
			console.log ('form: '+$(BlogIt.pm['skin-classes']['blog-form']+ ' form').length);
			$(BlogIt.pm['skin-classes']['blog-form']+ ' form').each(function(){
				$(this).validate({
					submitHandler: function(form) {  //Only if the form validates
						console.log('submitHandler');
						console.log('dialog: '+$(form).parents('.jBox-content').length);
						if ($(form).parents('.jBox-content').length){
							console.log('calling ajax form');
							BlogIt.fn.ajaxForm($(form), BlogIt.fn.updateBlog, mode,e);
						}else{
							$(window).off('beforeunload');
							console.log('calling normal form');
							form.submit();
						}
					},
					rules: {
						ptv_entrydate: {datetime: true},
						ptv_entryurl: {require_from_group: [1, 'input[name="ptv_entrytitle"],input[name="ptv_entryurl"]']},
						ptv_entrytitle: {require_from_group: [1, 'input[name="ptv_entrytitle"],input[name="ptv_entryurl"]']}
					}
				});
			});

			//dialog comment form is not wrapped in class
			console.log('form selector: '+'.jBox-content form,'+ BlogIt.pm['skin-classes']['comment-list-wrapper']+ '+form');
			$('.jBox-content form,'+ BlogIt.pm['skin-classes']['comment-list-wrapper']+ '+form').each(function(){
				console.log('setting up comment validations: '+ (!mode ?'add' :mode));
				$(this).validate({
					submitHandler: function(form) {
						console.log('calling comment ajax form: '+(!mode ?'add' :mode));
						BlogIt.fn.ajaxForm($(form), BlogIt.fn.updateComment, (!mode ?'add' :mode),e);  //mode is undefined when normal comment add, since no onclick handler defined
					},
					rules: {
						ptv_commentauthor: {required: true},
						ptv_email: {required: true, email: true},
						ptv_website: {url: true}
					}
				});
			});
		},
		updateBlog: function(data, mode, $context, containerClass){
			//can't use closest since no eventTarget on DOM passed back from server; use bi_seek (filter/find) to start from top of DOM, work down
			//Can't use entire data.out, as pmwiki returns full html objects, which may include <table> tags, not just the <tr>
			var $new=$(data.out).bi_seek(containerClass);  //class is "class1 class2", bi_seek (find/filter) needs ".class1.class2"
			$context.replaceWith($new);  //update existing blog entry
			flash($new, data);
		},
		updateComment: function(data, mode, $context, containerClass){
			console.log('updating comment: '+mode+'::'+containerClass);
			console.log($context);
			var firstComment = $(BlogIt.pm['skin-classes']['comment-list']).length==0;
			var $new = (firstComment ?$(data.out).bi_seek('[id^="bi_ID"]').parent() :$(data.out).bi_seek('[id^="bi_ID"]'));
			if (data.result!='error'){
				var newCommentApproved = isCommentApproved($new);
				if (mode=='edit'){
					console.log ('new id: '+$new.attr('id'));
					$context.bi_seek('[id^="'+ $new.attr('id')+ '"]').replaceWith($new);
					if (newCommentApproved != isCommentApproved($context))  (newCommentApproved ?updateCommentCount(1,-1) :updateCommentCount(-1,1));
				}else{  //add or reply
					if (mode=='add')  $(BlogIt.pm['skin-classes']['comment-list-wrapper']+ '+form')[0].reset();  //Reset the comment form since we just submitted it
					$(BlogIt.pm['skin-classes'][(firstComment ?'comment-list-wrapper' :'comment-list')]).append($new);  //adding a new comment
					//recreate a new capcha code to prevent multiple submits
					$(BlogIt.pm['skin-classes']['comment-submit']+' img[src*="action\=captchaimage"]').replaceWith($('img[src*="action\=captchaimage"]', data.dom));  //TODO: What is this?
					$(BlogIt.pm['skin-classes']['comment-submit']+' input[name="captchakey"]').replaceWith($('input[name="captchakey"]', data.dom));
					(newCommentApproved ?updateCommentCount(1,0) :updateCommentCount(0,1))
				}
			}
			flash($new, data);
		},
		addTagEvents: function(){
			//Add autocomplete. :not only adds autocomplete if not already added.
			$('input[name="ptv_entrytags"]').each( function(){
				console.log(this);
				new Awesomplete( this, {
					list: BlogIt.pm.categories.split(','),
					autoFirst: true,
					//allow multiple comma separated
					filter: function(text, input) {
						return Awesomplete.FILTER_CONTAINS(text, input.match(/[^,]*$/)[0]);
					},
					replace: function(text) {
						var before = this.input.value.match(/^.+,\s*|/)[0];
						this.input.value = before + text + ", ";
					}
				});
			});
			//remove pmwiki tag characters [], and remove final comma
			$(document).on("blur", '#entrytags', function(e){ $this=$(this); $this.val($this.val().replace(/[,|\s]+$/,"")); });
		},
//Visuals
		showMsg: function(data){  //data{msg, result}
			if (data.msg)
				new jBox('Notice', {
					content: BlogIt.fn.xl(data.msg),
					addClass: (data.result=='error' ?'error' :'success'),
					closeButton:	(data.result=='error' ?true :false),
					closeOnClick: (data.result=='error' ?'box' :null),
					closeOnEsc: (data.result=='error' ?true :false),
					autoClose: (data.result=='error' ?false :BlogIt.pm['ajax-message-timer']),
					position: {x: 'left', y: 'top'}
				}
			);
		},
//Utilities
		xl: function(t){ return ( (BlogIt.xl[t] ?$('<div>'+BlogIt.xl[t]+'</div>').html() :t) ); },
		ajax: function(ajax, e){
			ajax['dataType'] = ajax.dataType || 'json';
			ajax['url'] = ( typeof ajax.url == 'function' ?ajax.url(e.target.href) :(ajax.url || e.target.href) );
			ajax['context'] = ajax.context || e.target;
			$.ajax(ajax);
		},
		addRequireGroup: function(){
			//Direct copy from jquery.validate/additional-methods.min.js, so we don't have to include entire file for single function
			$.validator.addMethod( "require_from_group", function( value, element, options ) {
				var $fields = $( options[ 1 ], element.form ),
					$fieldsFirst = $fields.eq( 0 ),
					validator = $fieldsFirst.data( "valid_req_grp" ) ? $fieldsFirst.data( "valid_req_grp" ) : $.extend( {}, this ),
					isValid = $fields.filter( function() {
						return validator.elementValue( this );
					} ).length >= options[ 0 ];

				// Store the cloned validator for future validation
				$fieldsFirst.data( "valid_req_grp", validator );

				// If element isn't being validated, run each require_from_group field's validation rules
				if ( !$( element ).data( "being_validated" ) ) {
					$fields.data( "being_validated", true );
					$fields.each( function() {
						validator.element( this );
					} );
					$fields.data( "being_validated", false );
				}
				return isValid;
			}, $.validator.format( "Please fill at least {0} of these fields." ) );  //TODO: XL()
		}
	};
}(jQuery);

