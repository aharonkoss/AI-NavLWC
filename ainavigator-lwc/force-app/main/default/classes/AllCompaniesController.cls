/**
 * @description Controller for the allCompanies LWC.
 *              Delegates to DashboardController.getCompanies() — no duplicate SOQL.
 */
public with sharing class AllCompaniesController {

    @AuraEnabled(cacheable=true)
    public static String getAllCompanies() {
        try {
            return DashboardController.getCompanies();
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching all companies: ' + e.getMessage());
        }
    }
}