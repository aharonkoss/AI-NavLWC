/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-25-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class DashboardController {

    @AuraEnabled(cacheable=true)
    public static String getDashboardStats() {
        try {
            Map<String, Object> stats = MockDataProvider.getDashboardStats();
            return JSON.serialize(stats);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching dashboard stats: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static String getCompanies() {
        try {
            List<Map<String, Object>> companies = MockDataProvider.getCompanies();
            return JSON.serialize(companies);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching companies: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static String getSignals(String companyId) {
        try {
            List<Map<String, Object>> signals = MockDataProvider.getSignals(companyId);
            return JSON.serialize(signals);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching signals: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static String getCompanyInfo(String companyId) {
        try {
            Map<String, Object> info = MockDataProvider.getCompanyInfo(companyId);
            return JSON.serialize(info);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching company info: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String updateCompany(String companyId, String stage, String clientType) {
        try {
            // Phase 6: Replace with actual API callout
            // For now, return success confirmation
            Map<String, Object> result = new Map<String, Object>{
                'success'    => true,
                'companyId'  => companyId,
                'stage'      => stage,
                'clientType' => clientType
            };
            return JSON.serialize(result);
        } catch (Exception e) {
            throw new AuraHandledException('Error updating company: ' + e.getMessage());
        }
    }
        @AuraEnabled(cacheable=true)
    public static String getCallPlan(String companyId) {
        try {
            Map<String, Object> callPlan = MockDataProvider.getCallPlan(companyId);
            return JSON.serialize(callPlan);
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching call plan: ' + e.getMessage());
        }
    }
    @AuraEnabled
    public static String deleteCompany(String companyId) {
        try {
            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting company: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static String retryCompany(String companyId) {
        try {
            return JSON.serialize(new Map<String, Object>{
                'success'   => true,
                'companyId' => companyId
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error retrying company: ' + e.getMessage());
        }
    }
}