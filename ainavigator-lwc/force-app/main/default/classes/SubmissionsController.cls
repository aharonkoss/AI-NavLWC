/**
 * @description       : 
 * @author            : ChangeMeIn@UserSettingsUnder.SFDoc
 * @group             : 
 * @last modified on  : 03-27-2026
 * @last modified by  : ChangeMeIn@UserSettingsUnder.SFDoc
**/
public with sharing class SubmissionsController {

    @AuraEnabled(cacheable=true)
    public static String getSubmissions() {
        // MOCK: mirror what the React API would return
        List<Map<String, Object>> subs = new List<Map<String, Object>>();

        subs.add(new Map<String, Object>{
            'submissionId' => 'sub-001',
            'companyName'  => 'Riverstone Construction',
            'website'      => 'https://riverstoneconstruction.com',
            'city'         => 'Indianapolis',
            'state'        => 'IN',
            'source'       => 'Upload',      // or 'Input'
            'status'       => 'completed',   // completed | processing | failed
            'submittedAt'  => '2026-03-24T16:30:00Z'
        });

        subs.add(new Map<String, Object>{
            'submissionId' => 'sub-002',
            'companyName'  => 'Acme Manufacturing Co.',
            'website'      => 'https://www.acmemfg.com',
            'city'         => 'Milwaukee',
            'state'        => 'WI',
            'source'       => 'Input',
            'status'       => 'completed',
            'submittedAt'  => '2026-03-20T14:05:00Z'
        });

        subs.add(new Map<String, Object>{
            'submissionId' => 'sub-003',
            'companyName'  => 'Summit Logistics LLC',
            'website'      => 'https://summitlogistics.com',
            'city'         => 'Chicago',
            'state'        => 'IL',
            'source'       => 'Upload',
            'status'       => 'processing',
            'submittedAt'  => '2026-03-19T10:10:00Z'
        });

        subs.add(new Map<String, Object>{
            'submissionId' => 'sub-004',
            'companyName'  => 'BlueSky Technology Group',
            'website'      => 'https://blueskytech.com',
            'city'         => 'Minneapolis',
            'state'        => 'MN',
            'source'       => 'Input',
            'status'       => 'failed',
            'submittedAt'  => '2026-03-18T09:45:00Z'
        });

        return JSON.serialize(subs);
    }
}