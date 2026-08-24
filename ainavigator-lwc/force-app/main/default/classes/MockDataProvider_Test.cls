/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-06-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
private class MockDataProvider_Test {

    @isTest
    static void testMockDataProviderMethods() {
        Test.startTest();
        
        // Execute all mock data methods to capture 100% line coverage
        Map<String, Object> stats = MockDataProvider.getDashboardStats();
        List<Map<String, Object>> companies = MockDataProvider.getCompanies();
        
        List<Map<String, Object>> signals1 = MockDataProvider.getSignals('comp-001');
        List<Map<String, Object>> signals2 = MockDataProvider.getSignals('comp-002');
        List<Map<String, Object>> signals4 = MockDataProvider.getSignals('comp-004');
        List<Map<String, Object>> signals5 = MockDataProvider.getSignals('comp-005');
        
        Map<String, Object> info1 = MockDataProvider.getCompanyInfo('comp-001');
        Map<String, Object> info2 = MockDataProvider.getCompanyInfo('comp-002');
        Map<String, Object> info4 = MockDataProvider.getCompanyInfo('comp-004');
        Map<String, Object> info5 = MockDataProvider.getCompanyInfo('comp-005');
        Map<String, Object> infoUnknown = MockDataProvider.getCompanyInfo('unknown');
        
        Map<String, Object> callPlan1 = MockDataProvider.getCallPlan('comp-001');
        Map<String, Object> callPlan2 = MockDataProvider.getCallPlan('comp-002');
        Map<String, Object> callPlan4 = MockDataProvider.getCallPlan('comp-004');
        Map<String, Object> callPlan5 = MockDataProvider.getCallPlan('comp-005');
        
        Test.stopTest();

        // Basic assertions to verify output
        System.assertNotEquals(null, stats, 'Mock stats should be returned');
        System.assertNotEquals(0, companies.size(), 'Mock companies list should be returned');
        System.assertNotEquals(0, signals1.size(), 'Mock signals should be returned');
    }
}