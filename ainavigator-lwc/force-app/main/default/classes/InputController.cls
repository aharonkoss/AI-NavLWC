/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-26-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class InputController {

    @AuraEnabled
    public static String submitCompany(
        String companyName,
        String website,
        String city,
        String state,
        String stage,
        String clientType
    ) {
        try {
            // MOCK: Simulate successful submission
            // FUTURE: Replace with HttpRequest to /user/companies/manual
            String newCompanyId = 'comp-' + String.valueOf(Math.floor(Math.random() * 9000 + 1000).intValue());
            return JSON.serialize(new Map<String, Object>{
                'success'    => true,
                'companyId'  => newCompanyId,
                'name'       => companyName,
                'website'    => website,
                'city'       => city,
                'state'      => state,
                'stage'      => stage,
                'clientType' => clientType,
                'status'     => 'pending',
                'createdAt'  => String.valueOf(DateTime.now())
            });
        } catch (Exception e) {
            throw new AuraHandledException('Error submitting company: ' + e.getMessage());
        }
    }
}