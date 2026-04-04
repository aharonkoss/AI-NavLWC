/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-27-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class AllCompaniesController {

    @AuraEnabled(cacheable=true)
    public static String getAllCompanies() {
        // getCompanies currently returns a List<Map<String, Object>>
        List<Map<String, Object>> companies = MockDataProvider.getCompanies();
        return JSON.serialize(companies);
    }
}