/**
 * AI_Navigator_Inbound_Trigger
 *
 * Fires on every AI_Navigator_Inbound__e Platform Event published
 * by Azure. Delegates all routing logic to the handler class.
 * Trigger logic stays minimal — one line.
 */
trigger AI_Navigator_Inbound_Trigger on AI_Navigator_Inbound__e (after insert) {
    AI_Navigator_Inbound_Handler.handle(Trigger.new);
}