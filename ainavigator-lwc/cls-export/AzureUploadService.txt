/**
 * AzureUploadService
 *
 * Called by the LWC file upload component after a file has been
 * staged to Azure Blob Storage. Creates a Submission__c record
 * and fires an UPLOAD outbound event to trigger batch processing.
 *
 * Usage:
 *   AzureUploadService.submitUpload(submissionId, fileName, blobPath, stage, clientType);
 */
public without sharing class AzureUploadService {

    public static void submitUpload(
        String submissionId,
        String fileName,
        String blobPath,
        String stage,
        String clientType
    ) {
        // Create the AI_Navigator_Submission__c tracking record
        AI_Navigator_Submission__c sub = new AI_Navigator_Submission__c(
            Submission_Id__c   = submissionId,
            File_Name__c       = fileName,
            Blob_Path__c       = blobPath,
            Status__c          = 'pending',
            Submitted_At__c    = DateTime.now(),
            Submitted_By__c    = UserInfo.getUserId()
        );

        try {
            insert sub;
        } catch (DmlException de) {
            System.debug(LoggingLevel.ERROR,
                'AzureUploadService: Failed to create Submission__c. ' + de.getMessage());
            return;
        }

        // Build payload matching UploadRequest.v1 schema
        Map<String, Object> payload = new Map<String, Object>{
            'submissionId' => submissionId,
            'fileName'     => fileName,
            'blobPath'     => blobPath,
            'stage'        => stage,
            'clientType'   => clientType
        };

        AI_Navigator_Event_Publisher.publish(
            'UPLOAD',
            'Request',
            'UploadRequest',
            JSON.serialize(payload)
        );
    }
}