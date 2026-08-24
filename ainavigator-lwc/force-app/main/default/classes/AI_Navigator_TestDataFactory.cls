/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 07-02-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
@isTest
public class AI_Navigator_TestDataFactory {
    public static AI_Navigator_Company__c createCompany(String name, String status) {
        AI_Navigator_Company__c c = new AI_Navigator_Company__c(
            Name = name,
            Website__c = 'https://' + name.replaceAll(' ', '').toLowerCase() + '.com',
            City__c = 'New York',
            State__c = 'NY',
            Status__c = status,
            Is_Hidden__c = false,
            Correlation_Id__c = AiNavigatorEventService.generateCorrelationId()
        );
        insert c;
        return c;
    }

    public static AI_Navigator_Submission__c createSubmission(String name, String status) {
        AI_Navigator_Submission__c s = new AI_Navigator_Submission__c(
            Submission_Id__c = AiNavigatorEventService.generateCorrelationId(),
            File_Name__c = name,
            Status__c = status,
            Submitted_At__c = DateTime.now(),
            Submitted_By__c = UserInfo.getUserId()
        );
        insert s;
        return s;
    }

    public static AI_Navigator_Signals__c createSignal(Id companyId, String headline) {
        AI_Navigator_Signals__c sig = new AI_Navigator_Signals__c(
            AI_Navigator_Company__c = companyId,
            Headline__c = headline,
            Is_New__c = true
        );
        insert sig;
        return sig;
    }
}