/**
 * @description Unit tests for AiNavigatorEventService.
 *              Covers correlation ID format contract (v2) and publish happy-path.
 *
 * @group AI Navigator - Tests
 */
@IsTest
private class AiNavigatorEventServiceTest {

    // -------------------------------------------------------------------------
    // generateCorrelationId — format contract
    // -------------------------------------------------------------------------

    @IsTest
    static void testCorrelationIdFormat() {
        Test.startTest();
        String corrId = AiNavigatorEventService.generateCorrelationId();
        Test.stopTest();

        // Must start with 'SF-'
        System.assert(corrId.startsWith('SF-'),
            'Correlation ID must start with SF- but was: ' + corrId);

        // Split into three parts: prefix, timestamp-ms, hex
        List<String> parts = corrId.split('-', 3);   // limit 3 so hex isn't split
        System.assertEquals(3, parts.size(),
            'Expected 3 dash-separated parts but got: ' + corrId);

        String prefix    = parts[0];   // 'SF'
        String tsSegment = parts[1];   // unix-ms digits
        String hexSegment = parts[2];  // 8-char lowercase hex

        // Prefix
        System.assertEquals('SF', prefix, 'First segment must be SF');

        // Timestamp segment must be all digits and 13 chars (unix-ms)
        System.assert(tsSegment.isNumeric(),
            'Timestamp segment must be numeric but was: ' + tsSegment);
        System.assertEquals(13, tsSegment.length(),
            'Timestamp segment must be 13 digits (unix-ms) but was length: ' + tsSegment.length());

        // Hex segment must be exactly 8 chars, all lowercase hex
        System.assertEquals(8, hexSegment.length(),
            'Hex segment must be 8 chars but was: ' + hexSegment);
        System.assert(hexSegment.equals(hexSegment.toLowerCase()),
            'Hex segment must be lowercase but was: ' + hexSegment);
        System.assert(hexSegment.containsOnly('0123456789abcdef'),
            'Hex segment must contain only hex chars but was: ' + hexSegment);

        // Total length must fit Text(36) field
        System.assert(corrId.length() <= 36,
            'Correlation ID length ' + corrId.length() + ' exceeds Text(36): ' + corrId);
    }

    @IsTest
    static void testCorrelationIdIsUniqueAcrossCalls() {
        Test.startTest();
        String id1 = AiNavigatorEventService.generateCorrelationId();
        String id2 = AiNavigatorEventService.generateCorrelationId();
        Test.stopTest();

        System.assertNotEquals(id1, id2,
            'Two consecutive correlation IDs must not be identical');
    }

    // -------------------------------------------------------------------------
    // publish — happy path (event bus mock)
    // -------------------------------------------------------------------------

    @IsTest
    static void testPublishSucceeds() {
        Test.startTest();
        String corrId = AiNavigatorEventService.generateCorrelationId();
        Map<String, Object> payload = new Map<String, Object>{
            'companyName' => 'Acme Corp',
            'website'     => 'https://www.acme.com'
        };

        // EventBus.publish is allowed in @IsTest context; it doesn't actually fire
        // but the SaveResult is successful so no exception should be thrown.
        Boolean threw = false;
        try {
            AiNavigatorEventService.publish(
                'RESEARCH_REQUEST',
                'ResearchRequest.v1',
                payload,
                corrId
            );
        } catch (Exception e) {
            threw = true;
        }
        Test.stopTest();

        System.assert(!threw, 'publish() should not throw on a well-formed event');

        // Verify correlationId and schemaVersion were injected into the payload map
        System.assertEquals(corrId, payload.get('correlationId'),
            'correlationId must be embedded in the payload map');
        System.assertEquals('ResearchRequest.v1', payload.get('schemaVersion'),
            'schemaVersion must be embedded in the payload map');
    }
}