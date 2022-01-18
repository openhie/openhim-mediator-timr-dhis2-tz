Introduction to TImR-DHIS2 Data Sync
====================================

This documentation will be talking of a openHIM mediator written in nodejs that is responsible for synchronizing data from TImR to DHIS2.
The mediator has several routes and each of these routes are responsible for synchronizing a respective data elements.
Below are the data elements that this mediator pushes to DHIS2

#.  Immunization Coverage

    * Pneumococcal conjugate (PCV13)

      * Pneumococcal (PCV13) (By Age,catchment,Dose and gender)

    * Oral Polio Vaccine (OPV)

      * Watoto Waliochanjwa Polio (By Age,catchment,Dose and gender)
    * DTP - Haemophilus influenzae type b conjugate and hepatitis b

      * Watoto Waliochanjwa Penta (By Age,catchment,Dose and gender)
    * Tetanus Toxoid

      * Watoto Wasiokuwa na Kinga ya Pepopunda Wakati wa Kujifungua (By  Gender)
      * Ambao Hali ya Kinga ya Pepopunda Haijulikani Wakati wa Kujifungua (By  Gender)
      * Watoto Waliokingwa Pepopunda Wakati wa Kujifungua (By Gender)
    * Measles and Rubella

      * No. of measles vaccinations (By Age,catchment,Dose and gender)
    * Rotavirus Vaccine

      * Rota umri wiki 6 hadi 15 (By catchment,Dose and gender)
      * Rota Umri Wiki 10 Hadi 32 (By catchment,Dose and gender)
    * BACILLUS CALMETTE-GUERIN VACCINE (BCG)

      * Watoto Waliochanjwa BCG (By Age,catchment,Dose and gender)

#.  Supplements Data Elements

    * Vitamin A

    * Nyongeza ya Vitamin A-Watoto Umri wa Miezi 6 (By Gender)

      * Nyongeza ya Vitamin A Watoto umri zaidi ya mwaka 1 - 5 (By Gender)
      * Nyongeza ya Vitamin A Watoto chini ya umri wa mwaka 1 (By Gender)

    * Mebendazole

      * Waliopewa Mebendazole / Albendazole Umri wa mwaka 1 hadi 5 (By  Gender)
#.  Breast Feeding

    * EBF

      * Watoto wachanga chini ya miezi sita wanaonyonya maziwa ya mama  pekee (EBF) (By Gender)
    * RF

      * Watoto wachanga wanaopewa maziwa mbadala (RF) (By Gender)

#.  Prevention of Mother to Child Transmission (PMTCT) of HIV

    * Watoto waliozaliwa na mama mwenye maambukizi ya VVU/ watoto  wenye HEID no. (By Gender)

#.  Mosquito Net
      * Watoto Waliopatiwa LLIN (By Gender)

#.  Weight-Age Ratio

      * Uwiano wa Uzito Kwa Umri (<1 year,>80% au > -2SD) (By Gender)
      * Uwiano wa Uzito Kwa Umri (<1 year,60-80% au -2SD hadi -3SD) (By  Gender)
      * Uwiano wa Uzito Kwa Umri (<1 year,<60% au < - 3SD) (By Gender)
      * Uwiano wa Uzito Kwa Umri (mwaka 1 mpaka 5,>80% au > -2SD) (By Gender)
      * Uwiano wa Uzito Kwa Umri (mwaka 1 mpaka 5,60-80% au -2SD hadi -3SD) (By  Gender)
      * Uwiano wa Uzito Kwa Umri (mwaka 1 mpaka 5,<60% au < - 3SD) (By Gender)
      * Child Visits
      * Jumla ya Mahudhurio ya Watoto Umri Chini ya Mwaka 1 (By Gender)
      * Jumla ya Mahudhurio ya Watoto Umri Mwaka 1 Mpaka 5 (By Gender)

#.  Birth Certificates

    * Watoto Walioandikishwa na Kupewa Vyeti vya Kuzaliwa

#.  CTC Data
    * Watoto waliohamishiwa Kliniki ya huduma na matibabu kwa wenye VVU (CTC)

#.  Mosquitouito Net Data

#.  Child Visit

    * Jumla ya Mahudhurio ya Watoto Umri Mwaka 1 Mpaka 5
    * Jumla ya Mahudhurio ya Watoto Umri Chini ya Mwaka 1

#.  TT

    * Watoto Waliokingwa Pepopunda Wakati wa Kujifungua
    * Watoto Wasiokuwa na Kinga ya Pepopunda Wakati wa Kujifungua
    * Ambao Hali ya Kinga ya Pepopunda Haijulikani Wakati wa Kujifungua

The mediator has 11 routes/channels responsible for synchronizing data with DHIS2. Below are the 11 routes/channels that comes with the mediator

.. list-table:: Routes/Channels

  * - openHIM Channel
    - Mediator Route
    - Descriptions

  * - TImR-DHIS2 Immunization Coverage  Sync
    - /syncImmunizationCoverage
    - Responsible for synchronizing immunization  coverage data

  * - TImR-DHIS2 Supplements Sync
    - /syncSupplements
    - Responsible for Supplements data sync

  * - TImR-DHIS2 Breast Feeding Sync
    - /syncBreastFeeding
    - Responsible for Breastfeeding data sync

  * - TImR and DHIS2 Birth Certificates Sync
    - /syncChildWithBirthCert
    - Respinsible for birth certificates data sync

  * - TImR-DHIS2 PMTCT  Sync
    - /syncPMTCT
    - Responsible for PMTCT data sync

  * - TImR-DHIS2 Mosquito Net Sync
    - /syncMosquitoNet
    - Responsible for Mosquito nets data sync.

  * - TImR-DHIS2 Age Weight Ratio Sync
    - /syncWeightAgeRatio
    - Responsible for Age Weight ratio data sync

  * - TImR-DHIS2 Child Visit Sync
    - /syncChildVisit
    - Responsible for child visit data sync

  * - TImR and DHIS2 Child Birth Certs Sync
    - /syncChildWithBirthCert
    - Responsible for Child Certificates data sync

  * - TImR and DHIS2 CTC Sync
    - /syncCTC
    - Responsible for CTC data sync

  * - TImR and DHIS2 TT Sync
    - /syncTT
    - Responsible for TT data

  * - TImR and DHIS2 Mark Dataset Completed
    - /completeDataset
    - Responsible for marking facility dataset as complete