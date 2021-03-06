import {
  ClosedGroupMessage,
  ContentMessage,
  OpenGroupMessage,
} from '../messages/outgoing';
import { RawMessage } from '../types/RawMessage';
import { TypedEventEmitter } from '../utils';
import { PubKey } from '../types';

type GroupMessageType = OpenGroupMessage | ClosedGroupMessage;

export interface MessageQueueInterfaceEvents {
  success: (message: RawMessage | OpenGroupMessage) => void;
  fail: (message: RawMessage | OpenGroupMessage, error: Error) => void;
}

export interface MessageQueueInterface {
  events: TypedEventEmitter<MessageQueueInterfaceEvents>;
  sendUsingMultiDevice(user: PubKey, message: ContentMessage): void;
  send(device: PubKey, message: ContentMessage): void;
  sendToGroup(message: GroupMessageType): void;
  sendSyncMessage(
    message: ContentMessage,
    sendTo: Array<PubKey>
  ): Promise<Array<void>>;
}
