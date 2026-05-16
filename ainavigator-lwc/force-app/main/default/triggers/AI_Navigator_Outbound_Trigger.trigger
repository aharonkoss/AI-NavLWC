/**
 * AI_Navigator_Outbound_Trigger
 *
 * Fires on every AI_Navigator_Outbound__e Platform Event published
 * by Salesforce. Delegates all routing logic to the handler class.
 */
trigger AI_Navigator_Outbound_Trigger on AI_Navigator_Outbound__e (after insert) {
    AI_Navigator_Outbound_Handler.handle(Trigger.new);
}