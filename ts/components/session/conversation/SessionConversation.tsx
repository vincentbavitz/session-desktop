// tslint:disable: no-backbone-get-set-outside-model

import React from 'react';
import classNames from 'classnames';

import { ConversationHeader } from '../../conversation/ConversationHeader';
import { SessionCompositionBox } from './SessionCompositionBox';
import { SessionProgress } from '../SessionProgress';

import { Message } from '../../conversation/Message';
import { TimerNotification } from '../../conversation/TimerNotification';

import { getTimestamp } from './SessionConversationManager';

import { SessionScrollButton } from '../SessionScrollButton';
import { SessionGroupSettings } from './SessionGroupSettings';
import { ResetSessionNotification } from '../../conversation/ResetSessionNotification';
import { Constants, getMessageQueue } from '../../../session';
import { MessageQueue } from '../../../session/sending';

interface State {
  conversationKey: string;
  sendingProgress: number;
  prevSendingProgress: number;
  // Sending failed:  -1
  // Not send yet:     0
  // Sending message:  1
  // Sending success:  2
  sendingProgressStatus: -1 | 0 | 1 | 2;

  unreadCount: number;
  messages: Array<any>;
  selectedMessages: Array<string>;
  isScrolledToBottom: boolean;
  doneInitialScroll: boolean;
  displayScrollToBottomButton: boolean;
  messageFetchTimestamp: number;

  showRecordingView: boolean;
  showOptionsPane: boolean;
  showScrollButton: boolean;
}

export class SessionConversation extends React.Component<any, State> {
  private readonly messagesEndRef: React.RefObject<HTMLDivElement>;
  private readonly messageContainerRef: React.RefObject<HTMLDivElement>;

  constructor(props: any) {
    super(props);

    const conversationKey = this.props.conversations.selectedConversation;
    const conversation = this.props.conversations.conversationLookup[
      conversationKey
    ];
    const unreadCount = conversation.unreadCount;

    console.log(`[conv] Conversation:`, conversation);

    this.state = {
      sendingProgress: 0,
      prevSendingProgress: 0,
      sendingProgressStatus: 0,
      conversationKey,
      unreadCount,
      messages: [],
      selectedMessages: [],
      isScrolledToBottom: !unreadCount,
      doneInitialScroll: false,
      displayScrollToBottomButton: false,
      messageFetchTimestamp: 0,

      showRecordingView: false,
      showOptionsPane: false,
      showScrollButton: false,
    };

    this.handleScroll = this.handleScroll.bind(this);
    this.scrollToUnread = this.scrollToUnread.bind(this);
    this.scrollToBottom = this.scrollToBottom.bind(this);

    this.renderMessage = this.renderMessage.bind(this);

    // Group settings panel
    this.toggleGroupSettingsPane = this.toggleGroupSettingsPane.bind(this);
    this.getGroupSettingsProps = this.getGroupSettingsProps.bind(this);

    // Recording view
    this.onLoadVoiceNoteView = this.onLoadVoiceNoteView.bind(this);
    this.onExitVoiceNoteView = this.onExitVoiceNoteView.bind(this);

    // Messages
    this.selectMessage = this.selectMessage.bind(this);
    this.resetSelection = this.resetSelection.bind(this);
    this.updateSendingProgress = this.updateSendingProgress.bind(this);
    this.resetSendingProgress = this.resetSendingProgress.bind(this);
    this.onMessageSending = this.onMessageSending.bind(this);
    this.onMessageSuccess = this.onMessageSuccess.bind(this);
    this.onMessageFailure = this.onMessageFailure.bind(this);

    this.messagesEndRef = React.createRef();
    this.messageContainerRef = React.createRef();

    // Keyboard navigation
    this.onKeyDown = this.onKeyDown.bind(this);
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~ LIFECYCLES ~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  public componentDidMount() {
    this.getMessages()
      .then(() => {
        // Pause thread to wait for rendering to complete
        setTimeout(() => {
          this.scrollToUnread();
        }, 0);
        setTimeout(() => {
          this.setState({
            doneInitialScroll: true,
          });
        }, 100);
      })
      .catch();

    this.updateReadMessages();
  }

  public componentDidUpdate() {
    // Keep scrolled to bottom unless user scrolls up
    if (this.state.isScrolledToBottom) {
      this.scrollToBottom();
    }

    console.log(`[update] Props: `, this.props);
  }

  public async componentWillReceiveProps() {
    const timestamp = getTimestamp();

    // If we have pulled messages in the last second, don't bother rescanning
    // This avoids getting messages on every re-render.
    if (timestamp > this.state.messageFetchTimestamp) {
      await this.getMessages();
    }
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~ RENDER METHODS ~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  public render() {
    const {
      messages,
      conversationKey,
      doneInitialScroll,
      showRecordingView,
      showOptionsPane,
      showScrollButton,
    } = this.state;
    const loading = !doneInitialScroll || messages.length === 0;
    const selectionMode = !!this.state.selectedMessages.length;

    const conversation = this.props.conversations.conversationLookup[
      conversationKey
    ];
    const conversationModel = window.ConversationController.get(
      conversationKey
    );
    const isRss = conversation.isRss;

    // TODO VINCE: OPTIMISE FOR NEW SENDING???
    const sendMessageFn = conversationModel.sendMessage.bind(conversationModel);

    const shouldRenderGroupSettings =
      !conversationModel.isPrivate() && !conversationModel.isRss();
    const groupSettingsProps = this.getGroupSettingsProps();

    return (
      <>
        <div
          className={classNames(
            'conversation-item__content',
            selectionMode && 'selection-mode'
          )}
          tabIndex={0}
          onKeyDown={this.onKeyDown}
          role="navigation"
        >
          <div className="conversation-header">{this.renderHeader()}</div>

          <SessionProgress
            visible={true}
            value={this.state.sendingProgress}
            prevValue={this.state.prevSendingProgress}
            sendStatus={this.state.sendingProgressStatus}
            resetProgress={this.resetSendingProgress}
          />

          <div className="messages-wrapper">
            {loading && <div className="messages-container__loading" />}

            <div
              className="messages-container"
              onScroll={this.handleScroll}
              ref={this.messageContainerRef}
            >
              {this.renderMessages()}
              <div ref={this.messagesEndRef} />
            </div>

            <SessionScrollButton
              show={showScrollButton}
              onClick={this.scrollToBottom}
            />
            {showRecordingView && (
              <div className="messages-wrapper--blocking-overlay" />
            )}
          </div>

          {!isRss && (
            <SessionCompositionBox
              sendMessage={sendMessageFn}
              onMessageSending={this.onMessageSending}
              onMessageSuccess={this.onMessageSuccess}
              onMessageFailure={this.onMessageFailure}
              onLoadVoiceNoteView={this.onLoadVoiceNoteView}
              onExitVoiceNoteView={this.onExitVoiceNoteView}
            />
          )}
        </div>

        {shouldRenderGroupSettings && (
          <div
            className={classNames(
              'conversation-item__options-pane',
              showOptionsPane && 'show'
            )}
          >
            <SessionGroupSettings {...groupSettingsProps} />
          </div>
        )}
      </>
    );
  }

  public renderMessages() {
    const { messages } = this.state;

    // FIXME VINCE: IF MESSAGE IS THE TOP OF UNREAD, THEN INSERT AN UNREAD BANNER

    return (
      <>
        {messages.map((message: any) => {
          const messageProps = message.propsForMessage;
          const quoteProps = message.propsForQuote;

          const timerProps = message.propsForTimerNotification && {
            i18n: window.i18n,
            ...message.propsForTimerNotification,
          };
          const friendRequestProps = message.propsForFriendRequest && {
            i18n: window.i18n,
            ...message.propsForFriendRequest,
          };
          const resetSessionProps = message.propsForResetSessionNotification && {
            i18n: window.i18n,
            ...message.propsForResetSessionNotification,
          };

          const attachmentProps = message.propsForAttachment;
          const groupNotificationProps = message.propsForGroupNotification;

          let item;
          // firstMessageOfSeries tells us to render the avatar only for the first message
          // in a series of messages from the same user
          item = messageProps
            ? this.renderMessage(messageProps, message.firstMessageOfSeries)
            : item;
          item = quoteProps
            ? this.renderMessage(
                timerProps,
                message.firstMessageOfSeries,
                quoteProps
              )
            : item;

          item = timerProps ? <TimerNotification {...timerProps} /> : item;
          item = resetSessionProps ? (
            <ResetSessionNotification {...resetSessionProps} />
          ) : (
            item
          );
          // item = attachmentProps  ? this.renderMessage(timerProps) : item;

          return item;
        })}
      </>
    );
  }

  public renderHeader() {
    const headerProps = this.getHeaderProps();

    console.log(`[header] Headerprops: `, headerProps);

    return (
      <ConversationHeader
        id={headerProps.id}
        name={headerProps.name}
        phoneNumber={headerProps.phoneNumber}
        profileName={headerProps.profileName}
        avatarPath={headerProps.avatarPath}
        isVerified={headerProps.isVerified}
        isMe={headerProps.isMe}
        isClosable={headerProps.isClosable}
        isGroup={headerProps.isGroup}
        isPublic={headerProps.isPublic}
        isRss={headerProps.isRss}
        amMod={headerProps.amMod}
        members={headerProps.members}
        subscriberCount={headerProps.subscriberCount}
        expirationSettingName={headerProps.expirationSettingName}
        showBackButton={headerProps.showBackButton}
        timerOptions={headerProps.timerOptions}
        hasNickname={headerProps.hasNickname}
        isBlocked={headerProps.isBlocked}
        isOnline={headerProps.isOnline}
        selectedMessages={headerProps.selectedMessages}
        isKickedFromGroup={headerProps.isKickedFromGroup}
        onInviteContacts={headerProps.onInviteContacts}
        onSetDisappearingMessages={headerProps.onSetDisappearingMessages}
        onDeleteMessages={headerProps.onDeleteMessages}
        onDeleteContact={headerProps.onDeleteContact}
        onResetSession={headerProps.onResetSession}
        onCloseOverlay={headerProps.onCloseOverlay}
        onDeleteSelectedMessages={headerProps.onDeleteSelectedMessages}
        onMoveToInbox={headerProps.onMoveToInbox}
        onShowSafetyNumber={headerProps.onShowSafetyNumber}
        onShowAllMedia={headerProps.onShowAllMedia}
        onShowGroupMembers={headerProps.onShowGroupMembers}
        onGoBack={headerProps.onGoBack}
        onBlockUser={headerProps.onBlockUser}
        onUnblockUser={headerProps.onUnblockUser}
        onClearNickname={headerProps.onClearNickname}
        onChangeNickname={headerProps.onChangeNickname}
        onCopyPublicKey={headerProps.onCopyPublicKey}
        onLeaveGroup={headerProps.onLeaveGroup}
        onAddModerators={headerProps.onAddModerators}
        onRemoveModerators={headerProps.onRemoveModerators}
        onAvatarClick={headerProps.onAvatarClick}
        onUpdateGroupName={headerProps.onUpdateGroupName}
        i18n={window.i18n}
      />
    );
  }

  public renderMessage(
    messageProps: any,
    firstMessageOfSeries: boolean,
    quoteProps?: any
  ) {
    const selected =
      !!messageProps?.id &&
      this.state.selectedMessages.includes(messageProps.id);

    messageProps.i18n = window.i18n;
    messageProps.selected = selected;
    messageProps.firstMessageOfSeries = firstMessageOfSeries;
    messageProps.onSelectMessage = (messageId: string) => {
      this.selectMessage(messageId);
    };

    messageProps.quote = quoteProps || undefined;

    return <Message {...messageProps} />;
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~ GETTER METHODS ~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  public async getMessages(
    numMessages?: number,
    fetchInterval = Constants.CONVERSATION.MESSAGE_FETCH_INTERVAL
  ) {
    const { conversationKey, messageFetchTimestamp } = this.state;
    const timestamp = getTimestamp();

    // If we have pulled messages in the last interval, don't bother rescanning
    // This avoids getting messages on every re-render.
    const timeBuffer = timestamp - messageFetchTimestamp;
    if (timeBuffer < fetchInterval) {
      return { newTopMessage: undefined, previousTopMessage: undefined };
    }

    let msgCount =
      numMessages ||
      Number(Constants.CONVERSATION.DEFAULT_MESSAGE_FETCH_COUNT) +
        this.state.unreadCount;
    msgCount =
      msgCount > Constants.CONVERSATION.MAX_MESSAGE_FETCH_COUNT
        ? Constants.CONVERSATION.MAX_MESSAGE_FETCH_COUNT
        : msgCount;

    const messageSet = await window.Signal.Data.getMessagesByConversation(
      conversationKey,
      { limit: msgCount, MessageCollection: window.Whisper.MessageCollection }
    );

    // Set first member of series here.
    const messageModels = messageSet.models;
    const messages = [];
    let previousSender;
    for (let i = 0; i < messageModels.length; i++) {
      // Handle firstMessageOfSeries for conditional avatar rendering
      let firstMessageOfSeries = true;
      if (i > 0 && previousSender === messageModels[i].authorPhoneNumber) {
        firstMessageOfSeries = false;
      }

      messages.push({ ...messageModels[i], firstMessageOfSeries });
      previousSender = messageModels[i].authorPhoneNumber;
    }

    const previousTopMessage = this.state.messages[0]?.id;
    const newTopMessage = messages[0]?.id;

    this.setState({ messages, messageFetchTimestamp: timestamp }, () => {
      if (this.state.isScrolledToBottom) {
        console.log(`[unread] Updating messages from getMessage`);
        this.updateReadMessages();
      }
    });

    console.log(`[header] messages: `, messages);

    return { newTopMessage, previousTopMessage };
  }

  public getHeaderProps() {
    const { conversationKey } = this.state;
    const conversation = window.ConversationController.get(conversationKey);

    const expireTimer = conversation.get('expireTimer');
    const expirationSettingName = expireTimer
      ? window.Whisper.ExpirationTimerOptions.getName(expireTimer || 0)
      : null;

    const members = conversation.get('members') || [];

    const headerProps = {
      id: conversation.id,
      name: conversation.getName(),
      phoneNumber: conversation.getNumber(),
      profileName: conversation.getProfileName(),
      color: conversation.getColor(),
      avatarPath: conversation.getAvatarPath(),
      isVerified: conversation.isVerified(),
      isMe: conversation.isMe(),
      isClosable: conversation.isClosable(),
      isBlocked: conversation.isBlocked(),
      isGroup: !conversation.isPrivate(),
      isOnline: conversation.isOnline(),
      isPublic: conversation.isPublic(),
      isRss: conversation.isRss(),
      amMod: conversation.isModerator(
        window.storage.get('primaryDevicePubKey')
      ),
      members,
      subscriberCount: conversation.get('subscriberCount'),
      selectedMessages: this.state.selectedMessages,
      isKickedFromGroup: conversation.get('isKickedFromGroup'),
      expirationSettingName,
      showBackButton: Boolean(
        conversation.panels && conversation.panels.length
      ),
      timerOptions: window.Whisper.ExpirationTimerOptions.map((item: any) => ({
        name: item.getName(),
        value: item.get('seconds'),
      })),
      hasNickname: !!conversation.getNickname(),

      onSetDisappearingMessages: (seconds: any) =>
        conversation.updateExpirationTimer(seconds),
      onDeleteMessages: () => conversation.destroyMessages(),
      onDeleteSelectedMessages: () => conversation.deleteSelectedMessages(),
      onCloseOverlay: () => conversation.resetMessageSelection(),
      onDeleteContact: () => conversation.deleteContact(),
      onResetSession: () => {
        conversation.endSession();
      },

      // These are view only and don't update the Conversation model, so they
      //   need a manual update call.
      onShowSafetyNumber: () => {
        conversation.showSafetyNumber();
      },
      onShowAllMedia: async () => {
        conversation.updateHeader();
      },
      onUpdateGroupName: () => {
        conversation.onUpdateGroupName();
      },
      onShowGroupMembers: async () => {
        await conversation.showMembers();
        conversation.updateHeader();
      },
      onGoBack: () => {
        conversation.resetPanel();
        conversation.updateHeader();
      },

      onBlockUser: () => {
        conversation.block();
      },
      onUnblockUser: () => {
        conversation.unblock();
      },
      onChangeNickname: () => {
        conversation.changeNickname();
      },
      onClearNickname: () => {
        conversation.setNickname(null);
      },
      onCopyPublicKey: () => {
        conversation.copyPublicKey();
      },
      onMoveToInbox: () => {
        conversation.setArchived(false);
      },
      onLeaveGroup: () => {
        window.Whisper.events.trigger('leaveGroup', conversation);
      },
      onInviteContacts: () => {
        // VINCE TODO: Inviting contacts ⚡️
        return;
      },

      onAddModerators: () => {
        window.Whisper.events.trigger('addModerators', conversation);
      },

      onRemoveModerators: () => {
        window.Whisper.events.trigger('removeModerators', conversation);
      },

      onAvatarClick: (pubkey: any) => {
        if (conversation.isPrivate()) {
          window.Whisper.events.trigger('onShowUserDetails', {
            userPubKey: pubkey,
          });
        } else if (!conversation.isRss()) {
          this.toggleGroupSettingsPane();
        }
      },
    };

    console.log(`[header] HeaderProps:`, headerProps);
    console.log(`[header] Conv: `, conversation);

    return headerProps;
  }

  public getGroupSettingsProps() {
    const { conversationKey } = this.state;
    const conversation = window.ConversationController.get(conversationKey);

    const ourPK = window.textsecure.storage.user.getNumber();
    const members = conversation.get('members') || [];

    return {
      id: conversation.id,
      name: conversation.getName(),
      memberCount: members.length,
      phoneNumber: conversation.getNumber(),
      profileName: conversation.getProfileName(),
      color: conversation.getColor(),
      description: '', // TODO VINCE: ENSURE DESCRIPTION IS SET
      avatarPath: conversation.getAvatarPath(),
      amMod: conversation.isModerator(),
      isKickedFromGroup: conversation.attributes.isKickedFromGroup,
      isGroup: !conversation.isPrivate(),
      isPublic: conversation.isPublic(),
      isAdmin: conversation.get('groupAdmins').includes(ourPK),
      isRss: conversation.isRss(),
      isBlocked: conversation.isBlocked(),

      timerOptions: window.Whisper.ExpirationTimerOptions.map((item: any) => ({
        name: item.getName(),
        value: item.get('seconds'),
      })),

      onSetDisappearingMessages: (seconds: any) =>
        conversation.setDisappearingMessages(seconds),

      onGoBack: () => {
        this.toggleGroupSettingsPane();
      },

      onUpdateGroupName: () => {
        window.Whisper.events.trigger('updateGroupName', conversation);
      },
      onUpdateGroupMembers: () => {
        window.Whisper.events.trigger('updateGroupMembers', conversation);
      },
      onInviteContacts: () => {
        // VINCE TODO: Inviting contacts ⚡️
        return;
      },
      onLeaveGroup: () => {
        window.Whisper.events.trigger('leaveGroup', conversation);
      },

      onShowLightBox: (lightBoxOptions = {}) => {
        conversation.showChannelLightbox(lightBoxOptions);
      },
    };
  }

  public toggleGroupSettingsPane() {
    const { showOptionsPane } = this.state;
    this.setState({ showOptionsPane: !showOptionsPane });
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~ MESSAGE HANDLING ~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  public updateSendingProgress(value: number, status: -1 | 0 | 1 | 2) {
    // If you're sending a new message, reset previous value to zero
    const prevSendingProgress = status === 1 ? 0 : this.state.sendingProgress;

    this.setState({
      sendingProgress: value,
      prevSendingProgress,
      sendingProgressStatus: status,
    });
  }

  public resetSendingProgress() {
    this.setState({
      sendingProgress: 0,
      prevSendingProgress: 0,
      sendingProgressStatus: 0,
    });
  }

  public onMessageSending() {
    // Set sending state 5% to show message sending
    const initialValue = 5;
    this.updateSendingProgress(initialValue, 1);

    console.log(`[sending] Message Sending`);
  }

  public onMessageSuccess() {
    console.log(`[sending] Message Sent`);
    this.updateSendingProgress(100, 2);
  }

  public onMessageFailure() {
    console.log(`[sending] Message Failure`);
    this.updateSendingProgress(100, -1);
  }

  public updateReadMessages() {
    const { isScrolledToBottom, messages, conversationKey } = this.state;

    // If you're not friends, don't mark anything as read. Otherwise
    // this will automatically accept friend request.
    const conversation = window.ConversationController.get(conversationKey);
    if (conversation.isBlocked()) {
      return;
    }

    let unread;

    if (!messages || messages.length === 0) {
      return;
    }

    if (isScrolledToBottom) {
      unread = messages[messages.length - 1];
    } else {
      unread = this.findNewestVisibleUnread();
    }

    if (unread) {
      const model = window.ConversationController.get(conversationKey);
      model.markRead(unread.attributes.received_at);
    }
  }

  public findNewestVisibleUnread() {
    const messageContainer = this.messageContainerRef.current;
    if (!messageContainer) {
      return null;
    }

    const { messages, unreadCount } = this.state;
    const { length } = messages;

    const viewportBottom =
      messageContainer?.clientHeight + messageContainer?.scrollTop || 0;

    // Start with the most recent message, search backwards in time
    let foundUnread = 0;
    for (let i = length - 1; i >= 0; i -= 1) {
      // Search the latest 30, then stop if we believe we've covered all known
      //   unread messages. The unread should be relatively recent.
      // Why? local notifications can be unread but won't be reflected the
      //   conversation's unread count.
      if (i > 30 && foundUnread >= unreadCount) {
        return null;
      }

      const message = messages[i];

      if (!message.attributes.unread) {
        // eslint-disable-next-line no-continue
        continue;
      }

      foundUnread += 1;

      const el = document.getElementById(`${message.id}`);

      if (!el) {
        // eslint-disable-next-line no-continue
        continue;
      }

      const top = el.offsetTop;

      // If the bottom fits on screen, we'll call it visible. Even if the
      //   message is really tall.
      const height = el.offsetHeight;
      const bottom = top + height;

      // We're fully below the viewport, continue searching up.
      if (top > viewportBottom) {
        // eslint-disable-next-line no-continue
        continue;
      }

      if (bottom <= viewportBottom) {
        return message;
      }

      // Continue searching up.
    }

    return null;
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~ SCROLLING METHODS ~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  public async handleScroll() {
    const messageContainer = this.messageContainerRef.current;
    if (!messageContainer) {
      return;
    }

    const scrollTop = messageContainer.scrollTop;
    const scrollHeight = messageContainer.scrollHeight;
    const clientHeight = messageContainer.clientHeight;

    const scrollButtonViewShowLimit = 0.75;
    const scrollButtonViewHideLimit = 0.4;
    const scrollOffsetPx = scrollHeight - scrollTop - clientHeight;
    const scrollOffsetPc = scrollOffsetPx / clientHeight;

    // Scroll button appears if you're more than 75% scrolled up
    if (
      scrollOffsetPc > scrollButtonViewShowLimit &&
      !this.state.showScrollButton
    ) {
      this.setState({ showScrollButton: true });
    }
    // Scroll button disappears if you're more less than 40% scrolled up
    if (
      scrollOffsetPc < scrollButtonViewHideLimit &&
      this.state.showScrollButton
    ) {
      this.setState({ showScrollButton: false });
    }

    console.log(`[scroll] scrollOffsetPx: `, scrollOffsetPx);
    console.log(`[scroll] scrollOffsetPc: `, scrollOffsetPc);

    // Scrolled to bottom
    const isScrolledToBottom = scrollOffsetPc === 0;
    if (isScrolledToBottom) {
      console.log(`[scroll] Scrolled to bottom`);
    }

    // Mark messages read
    this.updateReadMessages();

    // Pin scroll to bottom on new message, unless user has scrolled up
    if (this.state.isScrolledToBottom !== isScrolledToBottom) {
      this.setState({ isScrolledToBottom });
    }

    // Fetch more messages when nearing the top of the message list
    const shouldFetchMoreMessages =
      scrollTop <= Constants.UI.MESSAGE_CONTAINER_BUFFER_OFFSET_PX;

    if (shouldFetchMoreMessages) {
      const numMessages =
        this.state.messages.length +
        Constants.CONVERSATION.DEFAULT_MESSAGE_FETCH_COUNT;

      // Prevent grabbing messags with scroll more frequently than once per 5s.
      const messageFetchInterval = 2;
      const previousTopMessage = (
        await this.getMessages(numMessages, messageFetchInterval)
      )?.previousTopMessage;

      if (previousTopMessage) {
        this.scrollToMessage(previousTopMessage);
      }
    }
  }

  public scrollToUnread() {
    const { messages, unreadCount } = this.state;
    const message = messages[messages.length - 1 - unreadCount];

    if (message) {
      this.scrollToMessage(message.id);
    }
  }

  public scrollToMessage(messageId: string) {
    const topUnreadMessage = document.getElementById(messageId);
    topUnreadMessage?.scrollIntoView();
  }

  public scrollToBottom() {
    // FIXME VINCE: Smooth scrolling that isn't slow@!
    // this.messagesEndRef.current?.scrollIntoView(
    //   { behavior: firstLoad ? 'auto' : 'smooth' }
    // );

    const messageContainer = this.messageContainerRef.current;
    if (!messageContainer) {
      return;
    }
    messageContainer.scrollTop =
      messageContainer.scrollHeight - messageContainer.clientHeight;
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~ MESSAGE SELECTION ~~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  public selectMessage(messageId: string) {
    const selectedMessages = this.state.selectedMessages.includes(messageId)
      ? // Add to array if not selected. Else remove.
        this.state.selectedMessages.filter(id => id !== messageId)
      : [...this.state.selectedMessages, messageId];

    this.setState({ selectedMessages });
  }

  public resetSelection() {
    this.setState({ selectedMessages: [] });
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~~ MICROPHONE METHODS ~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  private onLoadVoiceNoteView() {
    this.setState({
      showRecordingView: true,
      selectedMessages: [],
    });
  }

  private onExitVoiceNoteView() {
    this.setState({
      showRecordingView: false,
    });
  }

  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  // ~~~~~~~~~~~ KEYBOARD NAVIGATION ~~~~~~~~~~~~
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
  private onKeyDown(event: any) {
    const messageContainer = this.messageContainerRef.current;
    if (!messageContainer) {
      return;
    }

    const selectionMode = !!this.state.selectedMessages.length;
    const recordingMode = this.state.showRecordingView;

    const pageHeight = messageContainer.clientHeight;
    const arrowScrollPx = 50;
    const pageScrollPx = 0.8 * pageHeight;

    console.log(`[vince][key] event: `, event);

    console.log(`[vince][key] key: `, event.key);
    console.log(`[vince][key] key: `, event.keyCode);
    if (event.key === 'Escape') {
      //
    }

    switch (event.key) {
      case 'Escape':
        if (selectionMode) {
          this.resetSelection();
        }
        break;

      // Scrolling
      case 'ArrowUp':
        messageContainer.scrollBy(0, -arrowScrollPx);
        break;
      case 'ArrowDown':
        messageContainer.scrollBy(0, arrowScrollPx);
        break;
      case 'PageUp':
        messageContainer.scrollBy(0, -pageScrollPx);
        break;
      case 'PageDown':
        messageContainer.scrollBy(0, pageScrollPx);
        break;
      default:
    }
  }
}