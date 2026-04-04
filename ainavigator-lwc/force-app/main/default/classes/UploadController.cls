/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-27-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class UploadController {

    @AuraEnabled(cacheable=true)
    public static String getUploadSettings() {
        // Mock daily limit + used count + download template URLs (static text for now)
        return JSON.serialize(new Map<String, Object>{
            'dailyLimit'      => 5,
            'usedToday'       => 0,
            'remaining'       => 5,
            'templateCsvUrl'  => '/resource/Upload_Template_CSV',
            'templateXlsxUrl' => '/resource/Upload_Template_XLSX',
            'templateXlsUrl'  => '/resource/Upload_Template_XLS'
        });
    }

    @AuraEnabled(cacheable=true)
    public static String getPreviousSubmissions() {
        // For now, reuse the same mock as SubmissionsController
        return SubmissionsController.getSubmissions();
    }

    @AuraEnabled
    public static String uploadFile(String fileName, String base64Data, String defaultStage, String defaultClientType) {
        // MOCK: pretend upload succeeded and consumed 1 daily slot
        return JSON.serialize(new Map<String, Object>{
            'success'          => true,
            'message'          => 'File uploaded successfully. Processing will start shortly.',
            'dailyLimit'       => 5,
            'usedToday'        => 1,
            'remaining'        => 4,
            'createdSubmissionId' => 'sub-005'
        });
    }
}