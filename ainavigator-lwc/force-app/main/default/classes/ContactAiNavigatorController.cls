/**
 * @description Controller for the Contact-specific AI Navigator LWC.
 *              Filters by CreatedById to target only records owned by the current user [1].
 * @author       AI Navigator Platform
 * @last modified on : 06-01-2026
 */
public without sharing class ContactAiNavigatorController {
    
    @AuraEnabled(cacheable=false)
    public static ContactAiNavigatorWrapper getContactAndCompanyRecord(Id contactId) {
        try {
            if (contactId == null) {
                return null;
            }
            
            Contact con = [
                SELECT Id, FirstName, LastName, Email, AccountId, Account.Website 
                FROM Contact 
                WHERE Id = :contactId 
                LIMIT 1
            ];
            
            ContactAiNavigatorWrapper wrapper = new ContactAiNavigatorWrapper();
            wrapper.contactEmail = con.Email;
            wrapper.contactFirstName = con.FirstName;
            wrapper.contactLastName = con.LastName;
            
            if (con.AccountId != null && String.isNotBlank(con.Account.Website)) {
                String domain = normalizeUrl(con.Account.Website);
                
                // Query strictly filtered by the current running user's CreatedById [1]
                List<Company__c> companies = [
                    SELECT Id, Name, Status__c, Website__c, City__c, State__c, Azure_Company_Id__c 
                    FROM Company__c 
                    WHERE Website__c LIKE :('%' + domain + '%') 
                      AND CreatedById = :UserInfo.getUserId()
                    ORDER BY Status__c DESC, CreatedDate DESC 
                    LIMIT 1
                ];
                if (!companies.isEmpty()) {
                    wrapper.company = companies[0];
                }
            }
            return wrapper;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving Contact context: ' + e.getMessage());
        }
    }

    private static String normalizeUrl(String url) {
        if (String.isBlank(url)) return '';
        String clean = url.toLowerCase().trim();
        clean = clean.replaceFirst('^https?://', '');
        clean = clean.replaceFirst('^www\\.', '');
        if (clean.endsWith('/')) {
            clean = clean.substring(0, clean.length() - 1);
        }
        return clean;
    }
    
    public class ContactAiNavigatorWrapper {
        @AuraEnabled public Company__c company { get; set; }
        @AuraEnabled public String contactEmail { get; set; }
        @AuraEnabled public String contactFirstName { get; set; }
        @AuraEnabled public String contactLastName { get; set; }
    }
}