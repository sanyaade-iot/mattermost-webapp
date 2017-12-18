// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See License.txt for license information.

import $ from 'jquery';

import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';

import * as GlobalActions from 'actions/global_actions.jsx';

import Constants from 'utils/constants.jsx';
import * as UserAgent from 'utils/user_agent.jsx';
import * as Utils from 'utils/utils.jsx';

import EmojiPickerOverlay from 'components/emoji_picker/emoji_picker_overlay.jsx';
import FilePreview from 'components/file_preview.jsx';
import FileUpload from 'components/file_upload.jsx';
import MsgTyping from 'components/msg_typing.jsx';
import PostDeletedModal from 'components/post_deleted_modal.jsx';
import Textbox from 'components/textbox.jsx';

const KeyCodes = Constants.KeyCodes;

export default class CreateComment extends React.PureComponent {
    static propTypes = {

        /**
         * The channel for which this comment is a part of
         */
        channelId: PropTypes.string.isRequired,

        /**
         * The id of the parent post
         */
        rootId: PropTypes.string.isRequired,

        /**
         * The current draft of the comment
         */
        draft: PropTypes.shape({
            message: PropTypes.string.isRequired,
            uploadsInProgress: PropTypes.array.isRequired,
            fileInfos: PropTypes.array.isRequired
        }).isRequired,

        /**
         * Whether the submit button is enabled
         */
        enableAddButton: PropTypes.bool.isRequired,

        /**
         * Set to force form submission on CTRL/CMD + ENTER instead of ENTER
         */
        ctrlSend: PropTypes.bool,

        /**
         * The id of the latest post in this channel
         */
        latestPostId: PropTypes.string,

        /**
         * A function returning a ref to the sidebar
         */
        getSidebarBody: PropTypes.func,

        /**
         * Create post error id
         */
        createPostErrorId: PropTypes.string,

        /**
         * Called to clear file uploads in progress
         */
        clearCommentDraftUploads: PropTypes.func.isRequired,

        /**
         * Called when comment draft needs to be updated
         */
        onUpdateCommentDraft: PropTypes.func.isRequired,

        /**
         * Called when submitting the comment
         */
        onSubmit: PropTypes.func.isRequired,

        /**
         * Called when resetting comment message history index
         */
        onResetHistoryIndex: PropTypes.func.isRequired,

        /**
         * Called when navigating back through comment message history
         */
        onMoveHistoryIndexBack: PropTypes.func.isRequired,

        /**
         * Called when navigating forward through comment message history
         */
        onMoveHistoryIndexForward: PropTypes.func.isRequired,

        /**
         * Called to initiate editing the user's latest post
         */
        onEditLatestPost: PropTypes.func.isRequired,

        /**
         * Reset state of createPost request
         */
        resetCreatePostRequest: PropTypes.func.isRequired
    }

    constructor(props) {
        super(props);

        this.state = {
            showPostDeletedModal: false,
            showEmojiPicker: false,
            draft: {
                message: '',
                uploadsInProgress: [],
                fileInfos: []
            }
        };

        this.lastBlurAt = 0;
    }

    componentWillMount() {
        this.props.clearCommentDraftUploads();
        this.props.onResetHistoryIndex();
        this.setState({draft: {...this.props.draft, uploadsInProgress: []}});
    }

    componentDidMount() {
        this.focusTextbox();
    }

    componentWillUnmount() {
        this.props.resetCreatePostRequest();
    }

    componentWillReceiveProps(newProps) {
        if (newProps.createPostErrorId === 'api.post.create_post.root_id.app_error' && newProps.createPostErrorId !== this.props.createPostErrorId) {
            this.showPostDeletedModal();
        }
        if (newProps.rootId !== this.props.rootId) {
            this.setState({draft: {...newProps.draft, uploadsInProgress: []}});
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.draft.uploadsInProgress.length < this.state.draft.uploadsInProgress.length) {
            this.scrollToBottom();
        }

        if (prevProps.rootId !== this.props.rootId) {
            this.focusTextbox();
        }
    }

    toggleEmojiPicker = () => {
        this.setState({showEmojiPicker: !this.state.showEmojiPicker});
    }

    hideEmojiPicker = () => {
        this.setState({showEmojiPicker: false});
    }

    handleEmojiClick = (emoji) => {
        const emojiAlias = emoji.name || emoji.aliases[0];

        if (!emojiAlias) {
            //Oops.. There went something wrong
            return;
        }

        const {draft} = this.state;

        let newMessage = '';
        if (draft.message === '') {
            newMessage = `:${emojiAlias}: `;
        } else if (/\s+$/.test(draft.message)) {
            // Check whether there is already a blank at the end of the current message
            newMessage = `${draft.message}:${emojiAlias}: `;
        } else {
            newMessage = `${draft.message} :${emojiAlias}: `;
        }

        this.props.onUpdateCommentDraft({...draft, message: newMessage});

        this.setState({
            showEmojiPicker: false,
            draft: {...draft, message: newMessage}
        });

        this.focusTextbox();
    }

    handlePostError = (postError) => {
        this.setState({postError});
    }

    handleSubmit = async (e) => {
        e.preventDefault();

        const {enableAddButton} = this.props;
        const {draft} = this.state;

        if (!enableAddButton) {
            return;
        }

        if (draft.uploadsInProgress.length > 0) {
            return;
        }

        if (this.state.postError) {
            this.setState({errorClass: 'animation--highlight'});
            setTimeout(() => {
                this.setState({errorClass: null});
            }, Constants.ANIMATION_TIMEOUT);
            return;
        }

        try {
            await this.props.onSubmit();

            this.setState({
                postError: null,
                serverError: null
            });
        } catch (err) {
            this.setState({serverError: err.message});
        }

        const fasterThanHumanWillClick = 150;
        const forceFocus = (Date.now() - this.lastBlurAt < fasterThanHumanWillClick);
        this.setState({draft: {...this.props.draft, uploadsInProgress: []}});
        this.focusTextbox(forceFocus);
    }

    commentMsgKeyPress = (e) => {
        if (!UserAgent.isMobile() && ((this.props.ctrlSend && e.ctrlKey) || !this.props.ctrlSend)) {
            if (e.which === KeyCodes.ENTER && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                this.refs.textbox.blur();
                this.handleSubmit(e);
            }
        }

        GlobalActions.emitLocalUserTypingEvent(this.props.channelId, this.props.rootId);
    }

    scrollToBottom = () => {
        const $el = $('.post-right__scroll');
        if ($el[0]) {
            $el.parent().scrollTop($el[0].scrollHeight);
        }
    }

    handleChange = (e) => {
        const message = e.target.value;

        const {draft} = this.state;
        const updatedDraft = {...draft, message};
        this.props.onUpdateCommentDraft(updatedDraft);
        this.setState({draft: updatedDraft});

        this.scrollToBottom();
    }

    handleKeyDown = (e) => {
        if (this.props.ctrlSend && e.keyCode === KeyCodes.ENTER && e.ctrlKey) {
            this.commentMsgKeyPress(e);
            return;
        }

        const {draft} = this.state;
        const {message} = draft;

        if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && e.keyCode === KeyCodes.UP && message === '') {
            e.preventDefault();
            this.props.onEditLatestPost();
        }

        if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey) {
            if (e.keyCode === Constants.KeyCodes.UP) {
                e.preventDefault();
                this.props.onMoveHistoryIndexBack();
            } else if (e.keyCode === Constants.KeyCodes.DOWN) {
                e.preventDefault();
                this.props.onMoveHistoryIndexForward();
            }
        }
    }

    handleFileUploadChange = () => {
        this.focusTextbox();
    }

    handleUploadStart = (clientIds) => {
        const {draft} = this.state;
        const uploadsInProgress = [...draft.uploadsInProgress, ...clientIds];

        this.props.onUpdateCommentDraft({...draft, uploadsInProgress});
        this.setState({draft: {...draft, uploadsInProgress}});

        // this is a bit redundant with the code that sets focus when the file input is clicked,
        // but this also resets the focus after a drag and drop
        this.focusTextbox();
    }

    handleFileUploadComplete = (fileInfos, clientIds) => {
        const {draft} = this.state;
        const uploadsInProgress = [...draft.uploadsInProgress];
        const newFileInfos = [...draft.fileInfos, ...fileInfos];

        // remove each finished file from uploads
        for (let i = 0; i < clientIds.length; i++) {
            const index = uploadsInProgress.indexOf(clientIds[i]);

            if (index !== -1) {
                uploadsInProgress.splice(index, 1);
            }
        }

        this.props.onUpdateCommentDraft({...draft, fileInfos: newFileInfos, uploadsInProgress});
        this.setState({draft: {...draft, fileInfos: newFileInfos, uploadsInProgress}});

        // Focus on preview if needed/possible - if user has switched teams since starting the file upload,
        // the preview will be undefined and the switch will fail
        if (typeof this.refs.preview != 'undefined' && this.refs.preview) {
            this.refs.preview.refs.container.scrollIntoView();
        }
    }

    handleUploadError = (err, clientId = -1) => {
        if (clientId !== -1) {
            const {draft} = this.state;
            const uploadsInProgress = [...draft.uploadsInProgress];

            const index = uploadsInProgress.indexOf(clientId);
            if (index !== -1) {
                uploadsInProgress.splice(index, 1);
            }

            this.props.onUpdateCommentDraft({...draft, uploadsInProgress});
            this.setState({draft: {...draft, uploadsInProgress}});
        }

        this.setState({serverError: err});
    }

    removePreview = (id) => {
        const {draft} = this.state;
        const fileInfos = [...draft.fileInfos];
        const uploadsInProgress = [...draft.uploadsInProgress];

        // Clear previous errors
        this.handleUploadError(null);

        // id can either be the id of an uploaded file or the client id of an in progress upload
        let index = fileInfos.findIndex((info) => info.id === id);
        if (index === -1) {
            index = uploadsInProgress.indexOf(id);

            if (index !== -1) {
                uploadsInProgress.splice(index, 1);

                if (this.refs.fileUpload) {
                    this.refs.fileUpload.getWrappedInstance().cancelUpload(id);
                }
            }
        } else {
            fileInfos.splice(index, 1);
        }

        this.props.onUpdateCommentDraft({...draft, fileInfos, uploadsInProgress});
        this.setState({draft: {...draft, fileInfos, uploadsInProgress}});

        this.handleFileUploadChange();
    }

    getFileCount = () => {
        const {
            draft: {
                fileInfos,
                uploadsInProgress
            }
        } = this.state;
        return fileInfos.length + uploadsInProgress.length;
    }

    getFileUploadTarget = () => {
        return this.refs.textbox;
    }

    getCreateCommentControls = () => {
        return this.refs.createCommentControls;
    }

    focusTextbox = (keepFocus = false) => {
        if (this.refs.textbox && (keepFocus || !UserAgent.isMobile())) {
            this.refs.textbox.focus();
        }
    }

    showPostDeletedModal = () => {
        this.setState({
            showPostDeletedModal: true
        });
    }

    hidePostDeletedModal = () => {
        this.setState({
            showPostDeletedModal: false
        });

        this.props.resetCreatePostRequest();
    }

    handleBlur = () => {
        this.lastBlurAt = Date.now();
    }

    render() {
        const {draft} = this.state;

        let serverError = null;
        if (this.state.serverError) {
            serverError = (
                <div className='form-group has-error'>
                    <label className='control-label'>{this.state.serverError}</label>
                </div>
            );
        }

        let postError = null;
        if (this.state.postError) {
            const postErrorClass = 'post-error' + (this.state.errorClass ? (' ' + this.state.errorClass) : '');
            postError = <label className={postErrorClass}>{this.state.postError}</label>;
        }

        let preview = null;
        if (draft.fileInfos.length > 0 || draft.uploadsInProgress.length > 0) {
            preview = (
                <FilePreview
                    fileInfos={draft.fileInfos}
                    onRemove={this.removePreview}
                    uploadsInProgress={draft.uploadsInProgress}
                    ref='preview'
                />
            );
        }

        let uploadsInProgressText = null;
        if (draft.uploadsInProgress.length > 0) {
            uploadsInProgressText = (
                <span className='pull-right post-right-comments-upload-in-progress'>
                    {draft.uploadsInProgress.length === 1 ? (
                        <FormattedMessage
                            id='create_comment.file'
                            defaultMessage='File uploading'
                        />
                    ) : (
                        <FormattedMessage
                            id='create_comment.files'
                            defaultMessage='Files uploading'
                        />
                    )}
                </span>
            );
        }

        let addButtonClass = 'btn btn-primary comment-btn pull-right';
        if (!this.props.enableAddButton) {
            addButtonClass += ' disabled';
        }

        const fileUpload = (
            <FileUpload
                ref='fileUpload'
                getFileCount={this.getFileCount}
                getTarget={this.getFileUploadTarget}
                onFileUploadChange={this.handleFileUploadChange}
                onUploadStart={this.handleUploadStart}
                onFileUpload={this.handleFileUploadComplete}
                onUploadError={this.handleUploadError}
                postType='comment'
                channelId={this.props.channelId}
            />
        );

        let emojiPicker = null;
        if (window.mm_config.EnableEmojiPicker === 'true') {
            emojiPicker = (
                <span className='emoji-picker__container'>
                    <EmojiPickerOverlay
                        show={this.state.showEmojiPicker}
                        container={this.props.getSidebarBody}
                        target={this.getCreateCommentControls}
                        onHide={this.hideEmojiPicker}
                        onEmojiClick={this.handleEmojiClick}
                        rightOffset={15}
                        topOffset={55}
                    />
                    <span
                        className={'icon icon--emoji emoji-rhs ' + (this.state.showEmojiPicker ? 'active' : '')}
                        dangerouslySetInnerHTML={{__html: Constants.EMOJI_ICON_SVG}}
                        onClick={this.toggleEmojiPicker}
                    />
                </span>
            );
        }

        return (
            <form onSubmit={this.handleSubmit}>
                <div className='post-create'>
                    <div
                        id={this.props.rootId}
                        className='post-create-body comment-create-body'
                    >
                        <div className='post-body__cell'>
                            <Textbox
                                onChange={this.handleChange}
                                onKeyPress={this.commentMsgKeyPress}
                                onKeyDown={this.handleKeyDown}
                                handlePostError={this.handlePostError}
                                value={draft.message}
                                onBlur={this.handleBlur}
                                createMessage={Utils.localizeMessage('create_comment.addComment', 'Add a comment...')}
                                emojiEnabled={window.mm_config.EnableEmojiPicker === 'true'}
                                initialText=''
                                channelId={this.props.channelId}
                                isRHS={true}
                                popoverMentionKeyClick={true}
                                id='reply_textbox'
                                ref='textbox'
                            />
                            <span
                                ref='createCommentControls'
                                className='post-body__actions'
                            >
                                {fileUpload}
                                {emojiPicker}
                            </span>
                        </div>
                    </div>
                    <MsgTyping
                        channelId={this.props.channelId}
                        parentId={this.props.rootId}
                    />
                    <div className='post-create-footer'>
                        <input
                            type='button'
                            className={addButtonClass}
                            value={Utils.localizeMessage('create_comment.comment', 'Add Comment')}
                            onClick={this.handleSubmit}
                        />
                        {uploadsInProgressText}
                        {postError}
                        {preview}
                        {serverError}
                    </div>
                </div>
                <PostDeletedModal
                    show={this.state.showPostDeletedModal}
                    onHide={this.hidePostDeletedModal}
                />
            </form>
        );
    }
}
