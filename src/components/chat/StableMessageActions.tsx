'use client'

import { forwardRef, type ComponentPropsWithoutRef } from 'react'
import {
  MessageActions,
  ReactionSelector,
  defaultMessageActionSet,
  useDialogIsOpen,
  useDialogOnNearestManager,
  useMessageContext,
  useTranslationContext,
  type MessageActionSetItem,
} from 'stream-chat-react'

// Stream's default quick-toggle path in v14.0.1 can lose the anchor element
// ref on mobile. This replacement keeps Stream's original behavior (open/close
// dialog wiring) but uses a guaranteed native button ref for positioning.
const AnchoredQuickDropdownToggle = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<'button'>
>(function AnchoredQuickDropdownToggle({ className, ...props }, ref) {
  const { t } = useTranslationContext()
  const { message, threadList } = useMessageContext()

  const messageActionsDialogId = MessageActions.getDialogId({ messageId: message.id })
  const dropdownDialogIsOpen = useDialogIsOpen(messageActionsDialogId)
  const { dialog } = useDialogOnNearestManager({ id: messageActionsDialogId })

  const reactionSelectorDialogId = ReactionSelector.getDialogId({
    messageId: message.id,
    threadList,
  })
  const { dialog: dropdownReactionSelectorDialog } = useDialogOnNearestManager({
    id: `${reactionSelectorDialogId}-dropdown`,
  })

  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={dropdownDialogIsOpen}
      aria-haspopup="true"
      aria-label={t('aria/Open Message Actions Menu')}
      className={[
        'str-chat__button',
        'str-chat__button--secondary',
        'str-chat__button--ghost',
        'str-chat__button--circular',
        'str-chat__button--size-sm',
        'str-chat__message-actions-box-button',
        className,
      ].filter(Boolean).join(' ')}
      data-testid="message-actions-toggle-button"
      onClick={() => {
        dropdownReactionSelectorDialog?.close()
        dialog?.toggle()
      }}
      {...props}
    >
      <span className="str-chat__message-action-icon" aria-hidden="true">
        ⋯
      </span>
    </button>
  )
})

const FIXED_MESSAGE_ACTION_SET: MessageActionSetItem[] = defaultMessageActionSet.map((action) => {
  if (action.placement !== 'quick-dropdown-toggle') return action
  return {
    ...action,
    Component: AnchoredQuickDropdownToggle,
  }
})

export default function StableMessageActions() {
  return <MessageActions messageActionSet={FIXED_MESSAGE_ACTION_SET} />
}
